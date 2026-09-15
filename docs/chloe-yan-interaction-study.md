# Interacciones de Chloe Yan y una dirección para Inicio

Revisado el 14 de septiembre de 2026. Investigación inicial conservada como referencia.

**Alcance corregido por Antonio:** únicamente cursores SVG pequeños, con relleno blanco y contorno negro o la combinación inversa. Las propuestas de shaders, materiales y pistas adicionales de este estudio quedan fuera de la tarea. Los siete SVG de `public/cursors/` miden 20 × 20 px y se asignan mediante CSS a los elementos existentes: disco, marcador, cubo, manzana de Apple, esfera de ondas para shaders, móvil y sobre. Los puntos activos se ajustan al tamaño final. La silueta de Apple procede de Simple Icons; los otros seis dibujos son propios.

## Qué merece la pena trasladar

Cada objeto puede explicar su uso mediante el cursor y una reacción pequeña. Inicio ya tiene objetos con personalidad —vinilo, tinta y robot— y una composición editorial que permite destacarlos. La propuesta es desarrollar esas piezas y dar a los proyectos una firma visual reconocible.

Mantener la columna de 550 px, Geist, el fondo claro y los enlaces visibles. Concentrar el color, la textura y la respuesta al ratón en los objetos. Un visitante debería poder leer y navegar sin descubrir ningún gesto especial.

## Lo comprobado en la referencia

Se visitaron la portada, Shaders y Digital spaces con navegador y se consultaron los artículos enlazados. Se inspeccionaron el DOM y los CSS/JavaScript públicos servidos por esas páginas. Esto describe una versión concreta de la web, no una auditoría completa.

| Evidencia | Hallazgo | Aplicación a Inicio |
| --- | --- | --- |
| [Portada](https://www.chloeyan.me/) y su CSS | Plantas asociadas a secciones; cursores SVG de regadera, farol y oruga según superficie o modo. | Una familia de símbolos coherente con la acción o el contenido. |
| JavaScript público del jardín y la lluvia | Aparecen superficies Canvas 2D; el paraguas es una imagen que sigue al puntero. | Elegir la técnica por efecto. Un cursor estático y un objeto animado no requieren la misma solución. |
| [Shaders](https://www.chloeyan.me/shaders), DOM y About | Galería de cinco escenas, con vídeos MP4 e imágenes WebP de respaldo. La autora explica nubes con ruido fractal y dispersión atmosférica. No observé canvas en esta galería. | Distinguir una muestra de un shader de un shader ejecutándose e interactuando en la página. |
| [Sun-dappled light](https://www.chloeyan.me/digital-spaces/sunlight) | La autora describe luz y sombras construidas con CSS, desenfoques, escalas y mezcla de capas. | Probar primero luz local con CSS en vinilo y fotografía. |
| [Tiny campsite](https://www.chloeyan.me/digital-spaces/campsite) | Un lugar organizado alrededor de una acción sencilla y un pequeño descubrimiento adicional. | Dar a cada demo una acción comprensible antes de añadir controles. |

La relación útil es **objeto → pista → gesto → respuesta**. Un cursor contextual tiene más sentido cuando anticipa una acción. En una muestra puramente visual, su icono puede identificar el tema; no debería prometer arrastre o edición si esas acciones no existen.

No todas las zonas observadas cambian a un cursor ilustrado: varios enlaces mantienen `pointer`. La inspección de estilos permite confirmar cursores nativos aunque las capturas de pantalla de Playwright no dibujen el cursor del sistema. El paraguas se confirmó en código; no se probó todo el recorrido meteorológico.

## Lo que Inicio ya tiene

| Archivo | Base existente | Oportunidad |
| --- | --- | --- |
| `src/app/components/VinylPlayer.tsx` | Vinilo, reproducción, colección con arrastre, progreso y transiciones. Extrae color de la portada. | Hacer más evidente dónde se abre la colección y dónde se puede arrastrar. Usar ese color para un reflejo local. |
| `src/app/components/InkWritingLink.tsx` | Vista previa de tinta que se carga al recibir puntero o foco. | Añadir una firma de pluma y conservar el anticipo del trazo. |
| `src/app/components/ProjectShowcase.tsx` y `src/app/projects.ts` | Lista compacta con categoría, nombre y enlace. | Añadir símbolos y pequeñas vistas previas distintas por proyecto. |
| `src/app/components/FooterRobotMark.tsx` | El robot mira hacia el ratón, presta atención a enlaces y se puede arrastrar. | Afinar su respuesta y mostrar `grab` donde ya existe arrastre. |
| `src/app/components/LocalTime.tsx` | Hora de Madrid. | Posible estudio posterior de temperatura de luz en un objeto. |
| `src/app/globals.css` | Estados de foco, cursores, movimiento reducido y tratamiento táctil. | Integrar las nuevas pistas en estas convenciones. |

## Primera propuesta: pistas por objeto

Estos símbolos son conceptos para dibujar, no logotipos oficiales de los proyectos.

| Superficie | Pista propuesta | Respuesta | Prioridad |
| --- | --- | --- | --- |
| Control para abrir la colección musical | Disco pequeño + `Browse records` | Una funda se desplaza unos píxeles para anticipar la colección. | Alta |
| Colección de discos | Mano abierta/cerrada + `Drag to browse` | Reutilizar el arrastre y la selección existentes. | Alta |
| Enlace del artículo de tinta | Pluma + `Read` | El trazo existente se revela en su pequeño espacio. El clic sigue abriendo el artículo. | Alta |
| Tresdé | Cubo en perspectiva | Giro corto de un símbolo dentro de la fila. | Media |
| txniOS | Ventana o terminal | Aparición de una pequeña ventana que anuncia el tipo de proyecto. | Media |
| VGPU Lab | Chip o retícula | Muestra contenida de luz o distorsión que responde a la posición del ratón. | Alta, como primer experimento visual |
| Varita | Varita | Un destello breve ligado a la entrada del puntero. | Media |
| Minder | Símbolo por decidir tras revisar el producto | No elegir un icono funcional solo por su nombre. | Pendiente |
| Email | Sobre, conservando una señal de enlace | `Write an email`; abre el cliente de correo como ahora. | Baja |
| Carrete | Ninguna pista de acción por ahora | Actualmente es texto y está en construcción. Incorporar cámara/contacto fotográfico cuando exista destino o vista previa real. | Posterior |

Para los enlaces a proyectos, empezar por el símbolo en la fila y el cursor de enlace. Si un cursor ilustrado sustituye la mano, conservar `View` y el subrayado para que siga siendo evidente que navega. La pluma identifica el artículo; no debe convertir un enlace de lectura en una falsa superficie de dibujo.

### Reglas de diseño iniciales

- Símbolos originales de aproximadamente 24–32 px, con grosor, color y detalle compatibles con el robot. Dibujarlos a su tamaño final para comprobar legibilidad.
- Cursores nativos con SVG y punto activo definido en la punta o zona de contacto. Conservar fallback `pointer`, `grab` o `grabbing` según la acción.
- Probar la etiqueta después de unos 250 ms de permanencia. Es una hipótesis de diseño que debemos ajustar, no un valor extraído de Chloe.
- Una reacción principal por objeto: trazo, giro, brillo o desplazamiento. Un cursor ilustrado no necesita además una estela de partículas.
- El efecto debe terminar o quedarse quieto cuando el visitante deja de interactuar. Evitar animar cada fila continuamente.
- En teclado, ofrecer la misma información junto al elemento enfocado. En táctil, mantener acciones visibles y permitir actuar al primer toque; no exigir un toque previo para activar un hover.
- `prefers-reduced-motion`: misma información con estados estáticos y sin seguimiento, inclinación ni estelas.

## Segunda propuesta: materiales propios

### 1. Reflejo de vinilo

Mover una luz suave sobre los surcos según la posición del puntero. El disco sigue perteneciendo al reproductor actual y la funda aporta el color. El reflejo debe convivir con el giro y el progreso existentes, sin alterar reproducción ni búsqueda temporal.

Primera prueba: gradientes CSS recortados al disco. Solo considerar shader si se necesita una respuesta óptica que esa prueba no consiga.

### 2. Tinta que responde al contacto

En el enlace, mantener la vista previa actual. En una futura demo o artículo, permitir un gesto real de dibujo o una presión simulada con un control explícito. Reutilizar las curvas y filtros SVG de Inicio, con textura estable entre fotogramas.

La decisión editorial que podría explicar la pieza: «cómo anticipar un material antes de abrirlo». El cursor es una pista; el trazo demuestra la propiedad.

### 3. Luz dentro de VGPU Lab

Una superficie pequeña en la vista previa del proyecto. El puntero desplaza el centro de una refracción o un campo de luz; al salir, vuelve a reposo. El nombre y `View` permanecen legibles y fuera de la distorsión.

Aquí sí tiene sentido experimentar con un shader real: un plano, una textura o campo procedural, posición del puntero, resolución y tiempo mientras exista actividad. Cargar el módulo al entrar en la zona; detener el render fuera de pantalla y con la pestaña oculta. Si WebGL falla, mostrar una imagen propia o una versión CSS.

La muestra interactiva de esta conversación usa CSS para comparar la sensación. No demuestra todavía un shader WebGL ni está conectada con los proyectos o el audio real.

### 4. Papel fotográfico para Carrete

Cuando haya contenido disponible: una fotografía propia, margen de papel y un brillo que cambia con una inclinación pequeña. La fotografía lleva el protagonismo. Reservar grano o aberración para el interior de la pieza, sin añadir ruido sobre el texto del portfolio.

### 5. Hora y ambiente

Exploración posterior: luz cálida o fría en el reproductor según la hora de Madrid. El reloj ya existe. Primero probar un control manual en una demo para comparar estados; decidir después si la adaptación automática aporta algo. Evitar que la hora cambie el contraste de toda la página.

## Secuencia de implementación

1. **Pistas útiles.** Dibujar tres símbolos, aplicar cursores locales y añadir las etiquetas a colección, tinta y VGPU Lab. Comprobar clic, teclado, táctil y movimiento reducido.
2. **Un material.** Comparar reflejo CSS en vinilo con campo de luz en una vista previa de VGPU Lab. Elegir por claridad y carácter, no por cantidad de efectos.
3. **Una demo propia.** Si el campo de luz gana, desarrollar el shader y explicar una sola decisión en Writing siguiendo `docs/writing-style.md`.
4. **Ampliación selectiva.** Extender símbolos a los proyectos que lo necesiten; incorporar Carrete cuando tenga contenido real.

No hace falta añadir Three.js o React Three Fiber para la primera fase. React, Framer Motion, CSS y SVG ya están presentes. Tampoco hace falta un gestor global de cursores: atributos locales y reglas CSS cubren las primeras piezas. Solo extraer un componente de hint compartido cuando varias interacciones tengan el mismo comportamiento.

### Qué verificar antes de integrar

- El punto activo del cursor permite acertar en los controles pequeños; el icono no tapa el texto.
- Los enlaces siguen abriéndose con clic y Enter; el puntero contextual no aparece sobre texto seleccionable o controles de progreso por accidente.
- La colección conserva sus controles de teclado y arrastre; abrirla no reproduce audio inesperadamente.
- Las etiquetas no salen de la ventana ni bloquean clics; no dependen únicamente del ratón.
- A 320–390 px no aparece scroll horizontal ni un paso extra para navegar.
- Con movimiento reducido, el contenido se entiende igual. Sin WebGL, una eventual vista previa mantiene una imagen útil.
- Medir carga y fluidez de la implementación real. No se han realizado benchmarks en este estudio.

## Fuentes técnicas inspeccionadas

Las rutas con hash pueden cambiar cuando la autora publique otra versión. Se consultaron para entender mecanismos; no se copiaron ilustraciones, cursores ni código de la referencia al producto.

- [CSS público del jardín](https://www.chloeyan.me/_next/static/css/99155b7eba1aa0bd.css): cursores de regadera, farol y oruga; iluminación mediante gradientes, filtros y mezcla.
- [JavaScript público del jardín](https://www.chloeyan.me/_next/static/chunks/942-abcb4b57f76782b4.js): Canvas 2D, bucle de animación y pista para regar.
- [JavaScript público de lluvia/paraguas](https://www.chloeyan.me/_next/static/chunks/190-4c7cdf699b2ab1f2.js): Canvas 2D e imagen de paraguas vinculada al puntero.
- [CSS público de Shaders](https://www.chloeyan.me/_next/static/css/94489c26a8222598.css): cursor de nube en la galería.
- [Shaders y su About](https://www.chloeyan.me/shaders): explicación de ruido fractal y dispersión Rayleigh/Mie; vídeos e imágenes verificados en el DOM.

La referencia aporta la idea de objetos que invitan a una acción. Los símbolos, materiales, prioridades y reglas para Inicio de este documento son propuestas nuestras.

## Estado de la propuesta

La primera muestra de materiales ha quedado descartada para esta tarea. Los cursores finales están dibujados directamente en SVG, sin Lucide, y usan el cursor nativo del navegador. Se verificaron los siete archivos, las asignaciones CSS y su lectura sobre fondos claros y oscuros. `npm run build` pasa. No se desplegaron cambios.
