# Rendimiento de inicio

Medición del 15 de septiembre de 2026, sobre la compilación de producción local.
Cambios preparados en el proyecto; estas cifras no corresponden a un despliegue.

## Resultados

Medianas de las ejecuciones válidas de Lighthouse 13.4.1:

| Métrica | Móvil antes | Móvil después | Escritorio después |
| --- | ---: | ---: | ---: |
| Puntuación de rendimiento | 95 | **99** | **100** |
| Primer contenido visible, FCP | 1,80 s | **1,35 s** | **0,32 s** |
| Contenido principal visible, LCP | 2,73 s | **2,03 s** | **0,48 s** |
| Bloqueo total, TBT | 4,5 ms | **0 ms** | **0 ms** |
| Desplazamientos de contenido, CLS | 0,0066 | **0** | **0** |
| Speed Index | 1,82 s | **1,35 s** | **0,32 s** |
| Transferencia medida por Lighthouse | 360,4 kB | **195,6 kB** | **202,5 kB** |

En móvil: **26 % menos tiempo hasta el contenido principal**, **25 % menos hasta
el primer contenido** y **46 % menos transferencia**. La puntuación final osciló
entre 98 y 99; las tres ejecuciones de escritorio dieron 100.

Los valores de cada ejecución, configuración y recursos están en
[performance-results.json](performance-results.json). Los informes completos,
capturas y trazas locales están en `out/performance/`.

### Método y límites

- Móvil: 412 × 823, CPU ralentizada 4× y red simulada de Lighthouse de 1,6 Mbps,
  con RTT de 150 ms. Escritorio: preset estándar de Lighthouse.
- Dos ejecuciones válidas del estado inicial y tres del resultado por dispositivo,
  con caché fría. Las mediciones finales se ejecutaron secuencialmente.
- Otras ejecuciones del estado inicial terminaron con `NO_FCP`; se excluyeron,
  sin convertirlas en ceros. No se obtuvo una referencia de escritorio fiable.
- Se usó Chrome DevTools mediante su CLI contra una instancia aislada: el conector
  configurado con `--autoConnect` no encontró una sesión de Chrome disponible.
- La traza final de DevTools, local y sin ralentización, registró LCP de 29 ms y
  CLS de 0. No es comparable directamente con las cifras móviles simuladas.
- No hay datos de usuarios reales ni medición de INP de campo. La respuesta del
  alojamiento, la compresión y las cabeceras efectivas deben verificarse tras
  desplegar. Las definiciones se basan en [Web Vitals](https://web.dev/articles/vitals)
  y el análisis en [Chrome DevTools](https://developer.chrome.com/docs/devtools/performance).

## Cambios aplicados

1. **HTML generado al compilar.** Inicio contiene el texto y los enlaces antes de
   ejecutar React. El CSS pequeño se incluye en el HTML. El artículo conserva
   su documento de arranque separado, con las rutas de Vercel y preview ajustadas.
2. **Contenido visible desde el primer renderizado.** La entrada usa animaciones
   nativas de desplazamiento y respeta movimiento reducido; el texto ya no
   comienza con opacidad cero.
3. **JavaScript inicial más pequeño.** Los componentes ligeros de Motion separan
   las funciones de animación y arrastre. El JS inicial pasa de 346,7 a 272,2 kB
   sin comprimir, un 21 % menos. El módulo de animación se descarga después;
   el JavaScript total descargado sigue siendo parecido.
4. **Audio bajo demanda.** No se solicita ningún MP3 al abrir la página. La duración
   se muestra con metadatos guardados, y la reproducción sigue funcionando entre rutas.
5. **Imágenes adaptadas al tamaño visible.** Portadas de 144/256 píxeles con `srcset`,
   logos de 48 píxeles y texturas de 256. Se conservan los originales. Las dos
   imágenes del disco reutilizan el mismo recurso seleccionado.
6. **Fuente WOFF2.** Subconjunto latino de 35,2 kB frente a los 66,3 kB originales,
   precargado. Se mantienen los pesos variables y una fuente completa de respaldo.
7. **Menos trabajo durante la interacción.** Colores del vinilo precalculados;
   seguimiento del robot limitado a un cálculo por fotograma cuando es visible,
   con limpieza de observadores y eventos.
8. **Caché de archivos versionados.** Cabecera de un año e `immutable` para los
   recursos con hash de Vite en `/assets/`.

## Verificación

- Compilación de producción, TypeScript y `git diff --check`: correctos.
- Sin errores de consola ni discrepancias de hidratación observadas.
- Reproducción inicial, pausa, selección desde la colección y avance de cinco
  segundos con teclado: correctos.
- Audio continuo al ir al artículo y volver; posición y pista conservadas.
- Entrada directa a `/writing/ink#texture`, ancla, regreso e inicio: correctos.
- El servidor entrega HTML de inicio en `/` y el documento de rutas en artículo,
  rutas con barra final y rutas desconocidas.
- Vista móvil de 390 píxeles: imágenes cargadas, texto visible y sin desbordamiento.
- JavaScript desactivado: título y diez enlaces legibles.
- Movimiento reducido: contenido visible y cero animaciones activas.

## Repetir la medición

```bash
npm run build
npm run preview -- --host 127.0.0.1 --port 4173
# En otra terminal:
npm run perf
```

`npm run perf -- https://txnio.com/` aplica las mismas pruebas a un despliegue.
Los resultados se sobrescriben en `out/performance/`; Chrome debe estar instalado.
