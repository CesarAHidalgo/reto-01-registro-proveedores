# Solución técnica — registro como proveedor

## 1. Problema

La analista administrativa transcribe repetidamente información corporativa y busca soportes para registrar la empresa como proveedor; el objetivo es preparar formularios y paquetes verificables, dejando la firma y cualquier envío a personas.

## 2. Arquitectura

```text
Chat HTML/JS → API Express → ciclo del agente → interfaz AdaptadorLLM → Gemini
                               │
                               └→ herramientas Zod → lógica y archivos
                                    ├→ fixtures/ (lectura, datos ficticios)
                                    └→ out/ (formularios, paquetes y logs)
```

- **Comportamiento:** `agent/prompt.md`; conocimiento de proceso en `src/knowledge/registro-proveedor.md`.
- **Ejecución:** `src/tools/proveedor.ts`, funciones independientes del servidor con contratos Zod. Su contexto contiene la raíz del proyecto y sesión.
- **Interfaz:** `web/`, con historial, indicador, nombres de herramientas, argumentos resumidos y confirmación destacada; descarga del paquete ZIP.
- **Persistencia:** memoria para sesiones; archivos locales bajo `out/`. Los fixtures son solo lectura.
- `demo.ts` invoca herramientas sin modelo; se regenera el mapeo del maestro al producir formularios, sin confiar en datos aportados por el modelo.

## 3. Ciclo del agente

El servidor conserva la conversación y entrega prompt, conocimiento, historial y definiciones de herramientas al adaptador. Valida argumentos con Zod; ejecuta cada herramienta y devuelve su resultado al modelo. Se limita el número de rondas por turno y los tokens por sesión. Cada llamada tiene timeout; errores se comunican sin trazas ni detalles del proveedor.

La preparación del paquete activa un estado de confirmación gestionado por el servidor. El siguiente mensaje debe ser una confirmación explícita reconocida; únicamente entonces se llama a `simular_envio` con una señal de confirmación de servidor. Otro mensaje invalida ese estado. El resultado es un archivo local, nunca un envío real. El servidor muestra resúmenes de llamadas y registra eventos sin valores sensibles. Existe además un límite de peticiones por IP y un máximo de sesiones en memoria.

El prompt prohíbe inventar datos, pero una salida de lenguaje natural puede contener errores: los archivos, mapeos y estados obtenidos de herramientas son la evidencia autoritativa. Para producción se necesitaría validación adicional de afirmaciones antes de mostrarlas.

## 4. Modelo y costos

Se propone `gemini-2.5-flash-lite`, configurable, por soporte de herramientas y disponibilidad de nivel gratuito sujeto a cuota. Clave mediante `GEMINI_API_KEY` solo en el backend. Consultar cuota y disponibilidad de la cuenta antes de la defensa. El nivel gratuito de Google indica que el contenido puede utilizarse para mejorar sus productos; por eso se limita esta demo a los datos ficticios suministrados y no debe emplearse con datos corporativos reales.

Según la [tarifa oficial de Gemini](https://ai.google.dev/gemini-api/docs/pricing) consultada el 28-10-2026, para el nivel de pago estándar Flash-Lite 2.5: USD 0,10 por millón de tokens de entrada de texto y USD 0,40 por millón de tokens de salida; el nivel gratuito indica entrada y salida sin costo dentro de la cuota. Ejemplo ilustrativo, no medido: 10.000 tokens de entrada y 2.000 de salida cuestan aproximadamente USD 0,0018 en nivel pago. Cálculo = (10.000 × 0,10 + 2.000 × 0,40) / 1.000.000. El volumen real depende de las rondas y del contexto, y se debe medir con una clave válida. No se utiliza búsqueda externa.

## 5. Diseño de portal web

El portal no se automatiza: se produce `valores-portal.md`. En una evolución se podría usar navegador controlado o RPA con selectores por portal, tolerancia a cambios de interfaz y revisión visual. CAPTCHA y MFA obligan a intervención humana. Las credenciales residen en un gestor de secretos y las introduce la persona autorizada en el portal, nunca en el prompt, repositorio ni logs. El humano revisa datos, accede y pulsa el botón final de envío; el agente solo propone valores y soportes.

## 6. Decisiones y trade-offs

1. **Reglas deterministas frente a dejar el mapeo al modelo:** glosario y maestro evitan inventar datos y facilitan pruebas. A cambio, etiquetas desconocidas quedan faltantes; no se implementa un buscador semántico de baja confianza.
2. **Memoria y sistema de archivos frente a base de datos:** simplifica el alcance del reto. Se pierden sesiones y archivos cuando el entorno reinicia y no se soporta operación multiusuario fiable.
3. **Excel generado desde mapa de celdas frente a modificar un archivo original:** los fixtures proporcionan coordenadas JSON y no un Excel real; se crean las hojas y celdas indicadas. No conserva estilos de un archivo original inexistente.
4. **PDF generado frente a AcroForm:** se reproduce el orden de los campos del JSON y el texto; no se reconstruye el diseño de una plantilla PDF original no suministrada.
5. **Confirmación en servidor frente a confiar en un booleano del modelo:** protege la transición de envío simulado, pero la detección textual de la confirmación se limita a expresiones explícitas reconocidas.
6. **Dependencias:** Express (HTTP), Zod (contratos), ExcelJS (XLSX), pdf-lib (PDF), archiver (descarga ZIP), SDK de Google (modelo), dotenv (configuración); tsx/TypeScript para ejecución y verificación. `uuid` transitivo de ExcelJS se fuerza a una versión sin la alerta conocida y se verifica con la suite.

## 7. Supuestos

- La información incluida es ficticia según el PRD. El maestro es la fuente de verdad.
- Un soporte vence solo cuando `vigencia_hasta` es anterior al día actual en `APP_TIMEZONE`; el día indicado aún es vigente. Las pruebas inyectan fecha fija.
- Las reglas de identificador extranjero requieren confirmación aunque el NIT propuesto se coloque en el formulario.
- El estado `listo_para_firma` refleja exclusivamente la regla de soportes del PRD; los campos faltantes y confirmaciones se señalan por separado.
- Un alias exacto tiene confianza alta; una etiqueta sin correspondencia se reporta faltante. No se inventa un mapeo aproximado.
- La misma carpeta de salida por caso es compartida: esta versión no garantiza aislamiento entre múltiples usuarios ni operaciones simultáneas sobre un mismo caso.

## 8. Cobertura y estado

| Historia / requisito | Estado | Evidencia / límite |
| --- | --- | --- |
| HU1 lectura | Hecho localmente | Cuatro fixtures y plantilla corrupta en pruebas. |
| HU2 mapeo | Hecho localmente | Glosario, fuentes, faltantes y confirmación extranjera; sin mapeo difuso. |
| HU3 formatos | Hecho localmente | XLSX, PDF y portal; pruebas de archivos generados. |
| HU4 paquete | Hecho localmente | Soportes, vencimientos, checklist, borrador y simulación. |
| HU5 errores | Parcial | Errores tipados, plantilla corrupta y caso inexistente probados; no todas las combinaciones de fallo se han cubierto. |
| Chat con modelo real | Parcial | Ciclo y confirmaciones probados con modelo simulado; pendiente clave y prueba real de Gemini. |
| URL pública | Pendiente | Se evaluará al finalizar las pruebas locales; acceso y despliegue no configurados. |
| CI | Preparado | Flujo de GitHub Actions en repositorio; pendiente su ejecución en remoto. |
| Módulo | Preparado | `modulo/` enlaza a las mismas piezas mediante enlaces simbólicos; integración externa pendiente de verificación. |

Los comandos y resultados locales se detallan en `README.md` y se deben volver a ejecutar antes de la entrega.

## 9. Uso de IA

Se utilizó **Codex de OpenAI** para analizar el PRD, proponer e implementar arquitectura, código, pruebas y documentación. Se descartó confiar en un booleano generado por el modelo para autorizar el envío simulado: la confirmación se verifica en el servidor. La persona candidata debe revisar, comprender y poder explicar el código y las decisiones antes de entregarlo. No se ha usado Gemini para generar esta solución; es el proveedor propuesto para ejecutar el agente.

## 10. Riesgos y evolución a producción

El sistema no es apto para datos reales: faltan identidad individual, autorización por rol, aislamiento de sesiones y archivos, cifrado, retención, controles de acceso a soportes, observabilidad auditada y protección de datos antes de enviarlos al proveedor del modelo. Las salidas del modelo pueden ser incorrectas o estar influidas por entradas maliciosas; se requiere separación de confianza, verificación de afirmaciones y revisión humana. La autenticación básica opcional solo protege una demo compartida. Los archivos temporales pueden desaparecer con el reinicio del servicio y las operaciones simultáneas de un mismo caso pueden interferir. El límite de sesión no sustituye cuotas globales duraderas ni facturación monitorizada. Las tarifas, cuotas y condiciones del proveedor deben verificarse para el entorno real.
