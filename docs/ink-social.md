# Post y vídeo de tinta SVG

Preparado el 13 de septiembre de 2026. Borrador local, sin publicar.

## Texto

Tono: una observación personal y una invitación a trastear. Frases normales, sin convertir el detalle técnico en un eslogan. Evitar promesas de rendimiento, anécdotas de tiempo invertido y chistes añadidos para cerrar.

Versión en español:

> me gustó cómo pintaban las gráficas de anthropic, así que saqué el efecto y monté unas demos para trastearlo.
>
> un poco de svg, grano y pasadas de rotulador.
>
> [enlace al artículo]

Versión en inglés, para acompañar el idioma del artículo:

> really liked the way Anthropic’s charts draw themselves, so I took the effect apart and made a few demos to play with.
>
> a bit of svg, some grain, a few marker strokes.
>
> [article link]

Sustituir el marcador por la URL pública de `/writing/ink` cuando exista. No enlazar localhost ni afirmar que el efecto original es una creación de Antonio.

## Dirección del vídeo

Una demostración tranquila del material: papel claro, Geist, colores del efecto y planos cercanos. Movimiento desde el principio, comparaciones estables y pausas breves que permitan ver cada cambio. Las curvas son ilustrativas; no representan datos económicos.

El montaje usa las funciones de `src/app/writing/ink.ts` y renderiza los componentes `InkFilters` e `InkPaths` reales. Es un montaje exportado del SVG, no una grabación de la interfaz. Los cambios de estado están coreografiados y los rótulos pertenecen al vídeo. No muestra código.

| Tiempo | Plano | Qué permite observar |
| --- | --- | --- |
| 0–3,65 s | Abanico de tinta | El resultado y la aparición de segmentos con tiempos distintos. |
| 3,65–7,05 s | Path → Outline → Ink | La misma trayectoria vista como línea, contorno y relleno. |
| 7,05–11,5 s | Plain → Grain → Grain + warp | Acercamiento a la misma geometría para distinguir textura y borde. |
| 11,5–15,35 s | Una a seis pasadas | La composición multiplicada oscurece los cruces. |
| 15,35–18 s | Abanico completo | Cierre con invitación a explorar las demos. |

Exportación principal: `out/ink-social/ink-for-x.mp4`, 1080 × 1080, 30 fps, H.264, YUV 4:2:0, 18 segundos, sin audio. Portada: `out/ink-social/ink-cover.png`. La carpeta `out` ya está excluida de Git.

Verificación del archivo final: 540 fotogramas, 1.020.644 bytes, decodificación completa sin errores. Se revisaron fotogramas extraídos del MP4, incluido el grano a tamaño completo y el montaje reducido a 360 px por plano (`out/ink-social/storyboard.png`).

Regenerar con `node scripts/render-ink-video.mjs`. Añadir `--preview` para exportar solo fotogramas de revisión. El renderizador usa FFmpeg, Sharp y Canvas del runtime de trabajo; no añade dependencias a Inicio. Se puede indicar otra instalación con `INK_RENDER_NODE_MODULES`.

## Referencias consultadas

- [Presentación de Drawesome, archivada por posts.design](https://posts.design/benji-taylor-new-project-i-built-over-the-2026-07-29): referencia de presentación de una herramienta visual. Se toma la claridad de la demostración; no se copian su texto ni sus medios.
- [Emil Kowalski: You Don’t Need Animations](https://emilkowal.ski/ui/you-dont-need-animations): el movimiento debe ayudar a entender una interacción. En este montaje, el cambio de textura conserva la geometría y cada escena enseña una propiedad. La duración editorial del vídeo es una decisión propia, distinta de los tiempos recomendados para respuestas de una interfaz.
- [X: buenas prácticas de medios](https://docs.x.com/x-api/media/quickstart/best-practices): referencia para la codificación y los límites de los archivos. No se infiere alcance orgánico a partir de especificaciones de subida.
- [Original de Anthropic](https://www.anthropic.com/institute/econ-scenarios): procedencia del efecto. El artículo de Inicio conserva los créditos detallados del equipo original.

Antes de compartir: revisar el MP4 final, comprobar que el enlace público funciona y mantener el crédito de Anthropic. No se ha publicado ni programado nada.
