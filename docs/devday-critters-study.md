# Los bichos de OpenAI DevDay y cómo rehacerlos en Inicio

Revisado el 28 de septiembre de 2026. La página resultante es `/critters`.

## Dónde están

[devday.openai.com](https://devday.openai.com/) muestra hoy la edición de 2026. En su portada no hay animales, sprites, canvas ni WebGL. Se inspeccionaron el HTML, el CSS y todos los chunks de JavaScript, incluidos los que se cargan de forma diferida y las versiones de junio a septiembre de 2026 guardadas en el Internet Archive. Lo único animado es SVG y CSS:

| Pieza 2026 | Técnica |
| --- | --- |
| Titular `OpenAI DevDay [2026]` (`DrawDots`) | opentype.js analiza `OpenAISans-Medium.otf` en el navegador. Cada letra se convierte en un `<path>` SVG y sus nodos Bézier en círculos, descartando los que están a menos de 9 px entre sí. La entrada muestra por letra puntos grandes, puntos pequeños, contorno y relleno, siempre con `step-end` y sin interpolación. Al pasar el ratón, la letra vuelve a contorno y nodos durante 500 ms. |
| `DotButton` | El botón pasa de píldora a rectángulo en 180 ms. Después aparecen cuatro puntos de color en las esquinas, con 35 ms entre uno y otro. |
| Modal | Cuatro puntos fijos en las esquinas y entrada con `@starting-style`. |
| `AgendaCharacter` (página `/agenda`, privada) | Cara dentro de un círculo de color, con ojos y marcas tipográficas: `^ ^`, `+ +`, `> <`, `o o` y `<3`, `</>`, `=3`. |

Los animales (rana, serpiente, pez…) pertenecen a **DevDay 2025**, identidad de Studio Dumbar/DEPT ([caso de estudio](https://studiodumbar.com/work/openai-devday-2025), [D&AD](https://www.dandad.org/work/d-ad-awards-archive/openai-devday-2025)). Se estudiaron a partir de los fotogramas del vídeo del caso de estudio.

## Cómo están hechos los animales de 2025

Cada personaje es **una cadena de texto** en OpenAI Sans. El vídeo lo enseña como código:

```js
const characters = [
  hoots: "(ôvô)//,,,\\\\",          // búho, #328FF2
  hopper: "(\\_/)(o;;o)/(\")(\")",  // conejo, #FFFFFF
  slithy: "↧|§||§||§||§|(°)Y",      // serpiente
  shelldon: "[/|\\]",               // tortuga, #FF7B00
  webby: "({?})",                   // araña, #FF7B00
  froge: "◎,,◎(←→)(.>__<.)^^^^^^",  // rana, #54CA31
];
```

- **Presentación.** Aparece `import froge ◎,,◎(←→)(.>__<.)ΛΛΛ ΛΛΛ #54CA31 (6/6)` en una línea. Después, la cadena se parte en filas y el personaje queda montado.
- **Animación por fotogramas de texto.** Cada fotograma es otra cadena. Salto de la rana: `(.>__<.)` → `≤≈≈≈≥` agachada → `〈〈 〉〉` y `/|\ /|\ ooo ooo` estirada. Parpadeo: `◎` → `↦ ↤`. Lengua: `(‹={——~——~——●` hasta una mosca `c●ɔ` / `~●~`.
- **Serpiente.** Trabaja sobre una rejilla. Los segmentos `|§|` se giran 90° en los tramos horizontales. La cabeza es `‹°›` con la lengua `Y`, y la cola es una flecha. En las esquinas, los raíles se curvan. Se usa como juego (`pixel_python`) y como barra de carga o cuenta atrás entre corchetes, que termina resaltada en verde.
- **Pez.** `}<((°>` alterna fotogramas (`}<(°>`, `}<°>`) y suelta burbujas `°`. A su alrededor hay algas de llaves `{ }` que se balancean, peces naranjas `><;>` y `◊<`, y un suelo de `..!..`.
- Paleta: `#54CA31`, `#328FF2`, `#FF7B00` y blanco sobre negro.

## `/critters`: escenas en rejilla, como texto y como píxeles

Siete escenas, cada una con un animal en su entorno: froge en el estanque, slithy en el jardín, bubbles en el mar, hoots de noche, hopper en el prado, webby en su tela y shelldon en la playa.

- **Rejilla de editor.** Cada escena es una rejilla de 32 × 16 caracteres (`grid.ts`). Nada se mueve libremente: los animales avanzan celda a celda, la lengua de la rana crece carácter a carácter, las burbujas suben de fila en fila y las algas se inclinan una columna. Cada escena es una función del tiempo que escribe caracteres en la rejilla (`scenes/*.ts`).
- **Dos estilos, la misma rejilla.** *Text* dibuja cada celda con Geist, centrada en su celda. *Pixel* dibuja exactamente los mismos caracteres con una fuente bitmap de 5 × 7 hecha a mano (`font.ts`), sobre un lienzo de 192 × 160 (celdas de 6 × 10, como el texto monoespaciado del vídeo) escalado sin suavizado. El pixel art es, por tanto, el mismo ASCII carácter a carácter.
- **Animales como texto natural.** El escenario ocupa celdas, pero cada animal es un bloque de filas dibujado a su ancho natural (Geist proporcional, o la fuente de píxeles con el ancho de cada glifo) y colocado en una celda: se ve como el ASCII original y se mueve a saltos de celda. El entorno se borra detrás del animal.
- **La serpiente en su propia rejilla cuadrada** de 8 × 8 píxeles, para que sus segmentos sean tan anchos como altos: `§` entre raíles, raíles curvados en las esquinas, cabeza `‹°›` con lengua `Y` y cola en flecha.
- **Glifos que Geist no tiene.** `◎` es una `o` dentro de un anillo, y `⹁` y `ɔ` son una coma y una `c` reflejadas. La serpiente gira sus `§`, su lengua `Y` y su cola `↓` en cuartos de vuelta; la fuente de píxeles también sabe girarlos.
- Solo se redibuja cuando cambia la rejilla, y solo mientras la escena está en pantalla. Con movimiento reducido cada escena muestra un fotograma fijo.

### Fotogramas originales

Los personajes (`characters.ts`) se han copiado de la hoja de animación que aparece hacia el segundo 44 del vídeo del caso de estudio. En ella, cada animal tiene una fila de fotogramas numerados del 01 al 15:

- **froge**: reposo, guiño `↦,,◎`, parpadeo `↦,,↤`, agachado `≤≈≈≈≥`, impulso `〈〈 〉〉 /|\/|\ oooooo`, salto con las patas estiradas `// \\ || ||` y aterrizaje. La lengua `(‹={——~——●` procede de otra escena del vídeo.
- **hopper**: una oreja se dobla `(\_/›` y cae `(\_`, las dos se aplanan `/(o;;o)\`, parpadea `(-;;-)`, se levantan `‹\_/›`, se juntan `(\/)` y mira de lado `|)|)` `(° )`.
- **hoots**: ciclo de vuelo, con las alas que se abren, bajan `/(ôvô)\`, se ponen planas `——(ôvô)——`, suben `/¯\(ôvô)/¯\` y se alzan `\(ôvô)/`.
- **webby**: cuatro posturas de patas alrededor de `(oo)` `({?})` y dos parpadeos, `(-o)` y `(--)`.
- **slithy**: segmentos `|§|` y `§` tumbado entre raíles, esquinas que doblan los dos raíles, cabeza `‹o›` con la lengua `Y` y una flecha con barra como cola.
- **shelldon** (`/·/|\·\=o)` sobre `,———————`) y **bubbles** (`}<((°>` con la burbuja `·` → `°` → `o`) proceden de sus planos de presentación.
