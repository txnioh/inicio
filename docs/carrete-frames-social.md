# Vídeo de Fotogramas de Carrete

Pieza cuadrada y silenciosa de 9 segundos. Solo aparece el volumen de fotogramas
sobre negro puro, sin títulos, textos, línea de reproducción ni controles.
Usa únicamente el primer clip de la versión anterior: `DYcOiLDgj1H-03`, el
recorrido entre los edificios iluminados.

La entrada pasa del 100 % al 30 % en 0,7 segundos, desde la vista frontal a la
cámara inclinada. Después el vídeo reproduce a velocidad original, rellenando
el volumen mientras la cámara gira para mostrarlo por delante y por detrás.

El renderizador compila la función WebGL de `src/app/carrete/FrameVolume.tsx`
y usa sus ajustes y 160 muestras de los atlas originales. El fotograma activo
procede del MP4. La transparencia del volumen se compone sobre negro. Antes de
exportar se comprueban la profundidad y la continuidad con 96, 160 y 240 muestras.

## Archivos

- `out/carrete-frames-black/carrete-fotogramas-black.mp4`: 1080 × 1080, 60 fps,
  H.264, YUV 4:2:0, BT.709, sin audio.
- `out/carrete-frames-black/carrete-fotogramas-black-cover.png`: portada sin texto.
- `out/carrete-frames-black/storyboard.png`: fotogramas de revisión con marcas de tiempo.
- `out/carrete-frames-black/render.json`: medio y posiciones de reproducción.
- `out/carrete-frames-black/depth-checks.json`: resultados de las comprobaciones.

## Regeneración

```sh
node scripts/render-carrete-frames-video.mjs --preview
node scripts/render-carrete-frames-video.mjs
```

Requiere Chrome, FFmpeg y Playwright/Canvas del runtime de trabajo. La variable
`CARRETE_FILM_MODULES` permite indicar otra carpeta de dependencias.
`CARRETE_FILM_CLIP` admite un identificador de vídeo, como `DYcOiLDgj1H-03`.
Los artefactos se guardan en `out`, excluido de Git. La versión anterior con dos
clips sobre blanco permanece en `out/carrete-frames-social/`.
