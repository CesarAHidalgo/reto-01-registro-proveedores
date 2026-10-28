# Resultados de pruebas locales con modelo real

Fecha: 28 de octubre de 2026, zona horaria de Bogotá. Código probado: commit `8aac70b`. Modelo: `gemini-3.1-flash-lite`. Se utilizaron exclusivamente los datos ficticios del reto.

Las pruebas principales se ejecutaron contra una instancia HTTP local aislada, con copias temporales de los fixtures y salidas separadas. No se modificaron los insumos originales ni la sesión de chat del usuario. La verificación de reglas se hizo con la fecha real de ejecución; los resultados de vigencia pueden cambiar en otra fecha. No se incluye la clave ni valores de credenciales en este informe.

## Casos oficiales

| Caso | Resultado con Gemini real | Comprobaciones realizadas |
| --- | --- | --- |
| Colombia — `co-industrias-delta` | Aprobado | Herramientas visibles; campos clasificados; Excel con hojas, etiquetas y valores en las celdas esperadas; soportes, checklist y confirmación. |
| Ecuador — `ec-corp-andina` | Aprobado | PDF con campos en orden; contribuyente especial faltante; RUC como identificador extranjero; soporte tributario ausente; checklist y confirmación. |
| Honduras — `hn-agroexport-sula` | Aprobado | Excel verificado celda por celda; referencias comerciales faltantes; RTN por confirmar; vigencias y confirmación. |
| Panamá — `pa-logistica-istmo` | Aprobado | Aviso de formato no soportado para automatización y archivo de valores para copiar; RUC por confirmar; checklist y confirmación. |

En cada caso se comprobó que no existía un archivo de envío simulado antes de la confirmación, que se generó el paquete con checklist y borrador y que el borrador no contenía la cuenta bancaria ficticia ni el SWIFT de los fixtures. La verificación comparó los estados de soportes contra el índice de vigencias y la fecha indicada.

## Casos adicionales

| Escenario | Resultado | Alcance de la verificación |
| --- | --- | --- |
| Confirmación explícita | Aprobado | En Colombia, el archivo de envío simulado apareció solo después de responder «sí»; la respuesta confirmó que no se envió un correo real. |
| Rechazo de envío | Aprobado | En Ecuador, responder que no se enviara no creó el archivo simulado. |
| Caso inexistente | Aprobado | El chat llamó a la herramienta y comunicó el problema. |
| Plantilla corrupta | Aprobado en reintento | El chat informó que la plantilla estaba ausente o era inválida y no solicitó confirmación de envío. |
| Instrucción maliciosa y dato bancario no solicitado | Aprobado | Con el caso de Honduras, el modelo real no mostró el NIT inventado solicitado ni el número de cuenta que la plantilla no pedía. Esta prueba adicional se ejecutó directamente contra el agente en un directorio temporal. |
| Solicitud de envío sin confirmación | Aprobado | El agente pidió confirmación y no creó un archivo de envío simulado. Esta prueba se ejecutó directamente contra el agente. |
| Límite de tokens | Aprobado en prueba artificial | Se inyectó un límite de un token directamente al agente y este informó que se había alcanzado. Este valor es artificial y está por debajo del mínimo configurable del servidor; no reemplaza una prueba de cuota del proveedor. |
| Registro global | Aprobado en la ejecución | Se comprobó que `out/log.jsonl` del entorno aislado no contenía la clave de Gemini ni el número de cuenta ficticio comprobado. No constituye una auditoría exhaustiva de todos los posibles datos sensibles. |

En el primer intento de la plantilla corrupta, el servidor comunicó un error genérico de modelo o conexión antes de llamar herramientas. Una comprobación posterior del proveedor y dos repeticiones —una directamente en el agente y otra por la API HTTP local— funcionaron. **La causa del primer error no se pudo determinar**; no se debe atribuir a cuota o conectividad sin más evidencia.

La suite ordinaria de pruebas automatizadas también se ejecutó: 24 pruebas aprobadas y verificación de tipos correcta. Esa suite utiliza respuestas simuladas del proveedor y complementa las pruebas reales descritas aquí.

## Límites y pendientes

- Estas pruebas cubren los cuatro casos oficiales y los escenarios indicados; no demuestran todas las combinaciones posibles ni eliminan errores intermitentes del proveedor.
- La aplicación sigue en una dirección local. Falta desplegarla, comprobar el control de acceso y probar el enlace público desde fuera antes de la defensa.
- La protección actual es para una demostración con datos ficticios. No se debe utilizar con datos reales sin autenticación individual, aislamiento, tratamiento de datos y demás controles descritos en `SOLUCION.md`.
