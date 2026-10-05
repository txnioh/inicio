# Post y vídeo ASCII: MCP Gateway de Uber

Preparado el 5 de octubre de 2026. Borrador local, sin publicar.

Origen: [tweet de @UberEng](https://x.com/UberEng/status/2106071967619322330), que enlaza el artículo [Designing MCP Gateway: Uber's MCP Management Platform](https://www.uber.com/us/en/blog/designing-mcp-gateway/) (Uber Engineering, 1 de octubre de 2026).

## Texto para LinkedIn

Tono: cotidiano, sin siglas. Cualquiera que use IA en el trabajo debería entenderlo.

> Uber ha contado cómo deja que la IA use sus sistemas internos sin perder el control. La idea es sencilla: una sola puerta.
>
> Uber tiene miles de sistemas (viajes, pagos, mapas, pedidos). Si cada equipo conecta la IA a su manera, nadie sabe qué puede tocar.
>
> Así que toda la IA entra por el mismo sitio, y ahí:
>
> → se comprueba quién pide algo y si tiene permiso
> → los datos privados se tapan antes de salir
> → todo lo nuevo empieza cerrado hasta que su equipo lo aprueba
> → la IA pide solo lo que necesita, en vez de cargarlo todo
>
> Hoy son 800 conexiones y 5.000 acciones detrás de esa única puerta.
>
> Lo he resumido en un minuto, en formato terminal 👇
>
> Artículo: https://www.uber.com/us/en/blog/designing-mcp-gateway/

Subir el MP4 de forma nativa (no como enlace).

## Vídeo

Archivo: `out/mcp-gateway/mcp-gateway-ascii.mp4`, 1080 × 1080, 30 fps, H.264, 63,5 s, sin audio, unos 0,9 MB. Portada: `out/mcp-gateway/cover.png`. La carpeta `out` está excluida de Git.

Regenerar con `python3 scripts/render-mcp-gateway-video.py`; `--preview` exporta solo fotogramas de revisión. Necesita FFmpeg, Pillow, numpy y pyfiglet (`pip install pillow numpy pyfiglet`) y la fuente DejaVu Sans Mono.

Criterio: una idea por pantalla, palabras cotidianas, rejilla de 46 × 19 caracteres con letra grande y mucho espacio vacío. Sin siglas técnicas salvo «gateway» como subtítulo de la puerta.

| Tiempo | Pantalla |
| --- | --- |
| 0–6,5 s | ¿Cómo deja Uber que la IA use sus sistemas internos sin perder el control? |
| 6,5–11,5 s | Uber tiene miles de sistemas internos. |
| 11,5–17,5 s | Quiere que la IA pueda usarlos. |
| 17,5–23,5 s | Pero si cada equipo la conecta a su manera, nadie sabe qué puede tocar. |
| 23,5–30 s | La idea de Uber: una sola puerta. |
| 30–37,5 s | En la puerta se revisa cada petición; lo privado se tapa. |
| 37,5–44,5 s | Todo lo nuevo empieza cerrado hasta que su equipo lo aprueba. |
| 44,5–52 s | La IA no lo carga todo de golpe: pregunta solo lo que necesita. |
| 52–57,5 s | 800 conexiones, 5.000 acciones, una sola puerta. |
| 57,5–63,5 s | Una puerta. Reglas claras. Enlace al artículo. |

Equivalencias con el artículo: «puerta» es el MCP Gateway; «conexiones» son servidores MCP; «acciones» son tools; «empieza cerrado» es el estado desactivado por defecto; «pregunta solo lo que necesita» resume Omni MCP y Response Projection. Los ejemplos de acciones y el teléfono son ilustrativos.

## Procedencia de los datos

x.com y uber.com estaban bloqueados por la red del entorno de trabajo, así que el artículo no se leyó directamente. Los datos se contrastaron con resúmenes y extractos publicados en buscadores el 5 de octubre de 2026:

- Del artículo de Uber, según varios extractos coincidentes: gateway como capa de orquestación y routing entre agentes, servicios y servidores MCP nativos; Registry como control plane y Proxy como data plane; traducción a HTTP, gRPC y TChannel vía Muttley sin cambios en los servicios; relevo del token del usuario, autorización, rate limiting y redacción de datos sensibles; integraciones de terceros como Jira y Google; AutoCrawler sobre Cadence que lee Protobuf/Thrift y genera descripciones con un LLM; todo nace desactivado; Omni MCP con `discover_server`, `discover_tools`, `get_tool_schema` e `invoke_tool`; Response Projection; AIFX CLI frente al «shadow MCP»; más de 800 servidores y 5.000 tools.
- De fuentes secundarias: «10.000+ servicios» aparece en resúmenes del artículo y en otras publicaciones de Uber sobre su plataforma de agentes.
- No usado por no poder atribuirlo con seguridad al artículo: el ahorro de tokens del 40 %, 1.500 agentes activos al mes y 60.000 ejecuciones semanales (aparecen en otras publicaciones sobre la plataforma de agentes de Uber).

Antes de publicar: leer el artículo original para confirmar las cifras, revisar el MP4 completo y mantener el crédito a Uber Engineering. No se ha publicado ni programado nada.
