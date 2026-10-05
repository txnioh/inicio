# Post y vídeo ASCII: MCP Gateway de Uber

Preparado el 5 de octubre de 2026. Borrador local, sin publicar.

Origen: [tweet de @UberEng](https://x.com/UberEng/status/2106071967619322330), que enlaza el artículo [Designing MCP Gateway: Uber's MCP Management Platform](https://www.uber.com/us/en/blog/designing-mcp-gateway/) (Uber Engineering, 1 de octubre de 2026).

## Texto para LinkedIn

> Uber ha publicado cómo conecta sus agentes de IA con el resto de la empresa, y me parece de lo más útil que he leído sobre MCP en producción.
>
> El punto de partida: más de 10.000 servicios internos que hablan HTTP, gRPC y TChannel. Si cada equipo monta su propio servidor MCP, acabas con agentes tocando producción sin auth común, sin límites y sin saber quién es el dueño de qué.
>
> Su respuesta es un único MCP Gateway, partido en dos:
>
> → Registry (control plane): qué servidores y tools existen, quién es su dueño y si están activados.
> → Proxy (data plane): autorización por tool, rate limiting, redacción de datos sensibles y traducción de MCP al protocolo nativo de cada servicio. Los servicios de abajo no cambian.
>
> Tres ideas que me llevo:
>
> 1. Generar tools desde los contratos que ya existen. AutoCrawler lee los .proto y .thrift del registro de IDLs, usa un LLM para escribir descripciones pensadas para agentes y registra cada tool desactivada.
> 2. Descubrir no es exponer. Nada llega a un agente hasta que el equipo dueño lo revisa y lo activa, con la configuración versionada como código.
> 3. El contexto es escaso. Con 5.000 tools no puedes cargar todos los schemas: Omni MCP expone solo cuatro (discover_server, discover_tools, get_tool_schema, invoke_tool) y Response Projection deja que el agente pida únicamente los campos que necesita.
>
> Hoy: más de 800 servidores MCP y 5.000 tools detrás de un mismo punto de control.
>
> Lo he resumido en un vídeo de 80 segundos con pinta de terminal 👇
>
> Artículo completo: https://www.uber.com/us/en/blog/designing-mcp-gateway/
>
> #MCP #AIAgents #PlatformEngineering #SoftwareArchitecture

Versión corta, si se prefiere un post menos largo:

> Uber pone sus 800+ servidores MCP y 5.000 tools detrás de un único gateway: un registry que decide qué existe y un proxy que decide cómo se llama (auth, límites, redacción, traducción a gRPC/Thrift).
>
> Lo que más me gusta: todo lo que se descubre nace desactivado hasta que su dueño lo aprueba.
>
> Resumen en vídeo, estilo terminal 👇
> https://www.uber.com/us/en/blog/designing-mcp-gateway/

Subir el MP4 de forma nativa (no como enlace) y poner la URL del artículo en el texto o en el primer comentario.

## Vídeo

Archivo: `out/mcp-gateway/mcp-gateway-ascii.mp4`, 1080 × 1080, 30 fps, H.264, YUV 4:2:0, 79,8 s, sin audio, unos 2,2 MB. Portada: `out/mcp-gateway/cover.png`. La carpeta `out` está excluida de Git.

Regenerar con `python3 scripts/render-mcp-gateway-video.py`; `--preview` exporta solo fotogramas de revisión. Necesita FFmpeg, Pillow, numpy y pyfiglet (`pip install pillow numpy pyfiglet`) y la fuente DejaVu Sans Mono.

Todo el vídeo es una rejilla de 72 × 31 caracteres dentro de una ventana de terminal, con brillo de fósforo y líneas de barrido. Los caracteres de caja y bloque se dibujan como geometría para que se unan entre filas.

| Tiempo | Escena | Qué cuenta |
| --- | --- | --- |
| 0–8,5 s | `curl` al artículo y rótulo MCP GATEWAY | Qué es y de dónde sale. |
| 8,5–19 s | 01 · el problema | 10.000+ servicios, tres protocolos, conexiones sueltas: «shadow MCP». |
| 19–30,5 s | 02 · la solución | Diagrama agentes → Registry / Proxy → Muttley → HTTP, gRPC, TChannel y MCP nativos. |
| 30,5–41 s | 03 · AutoCrawler | IDL → descripción con LLM → tool DISABLED → revisión del dueño → `enabled: true`. |
| 41–51,8 s | 04 · la vida de una llamada | authn con token del usuario, authz por tool, rate limit, traducción, respuesta, redacción. |
| 51,8–65,3 s | 05 · contexto | Barra de contexto que se desborda con 5.000 schemas; Omni MCP con sus 4 tools; Response Projection. |
| 65,3–75,3 s | 06 · en producción | Contadores 800 / 5.000 / 10.000 y cuatro conclusiones. |
| 75,3–79,8 s | fuente y `exit` | Enlace al artículo. |

Los nombres de tools (`eats.get_order_status`, etc.), los ficheros IDL, el YAML y la respuesta JSON son ilustrativos y así se indica en pantalla. No son ejemplos del artículo.

## Procedencia de los datos

x.com y uber.com estaban bloqueados por la red del entorno de trabajo, así que el artículo no se leyó directamente. Los datos se contrastaron con resúmenes y extractos publicados en buscadores el 5 de octubre de 2026:

- Del artículo de Uber, según varios extractos coincidentes: gateway como capa de orquestación y routing entre agentes, servicios y servidores MCP nativos; Registry como control plane y Proxy como data plane; traducción a HTTP, gRPC y TChannel vía Muttley sin cambios en los servicios; relevo del token del usuario, autorización, rate limiting y redacción de datos sensibles; integraciones de terceros como Jira y Google; AutoCrawler sobre Cadence que lee Protobuf/Thrift y genera descripciones con un LLM; todo nace desactivado; Omni MCP con `discover_server`, `discover_tools`, `get_tool_schema` e `invoke_tool`; Response Projection; AIFX CLI frente al «shadow MCP»; más de 800 servidores y 5.000 tools.
- De fuentes secundarias: «10.000+ servicios» aparece en resúmenes del artículo y en otras publicaciones de Uber sobre su plataforma de agentes.
- No usado por no poder atribuirlo con seguridad al artículo: el ahorro de tokens del 40 %, 1.500 agentes activos al mes y 60.000 ejecuciones semanales (aparecen en otras publicaciones sobre la plataforma de agentes de Uber).

Antes de publicar: leer el artículo original para confirmar las cifras, revisar el MP4 completo y mantener el crédito a Uber Engineering. No se ha publicado ni programado nada.
