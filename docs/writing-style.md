# Escribir sobre interfaces en Inicio

Guía editorial para los artículos de Antonio. Leer antes de preparar el esquema, escribir el texto o diseñar sus demos. Artículos en inglés; documentación de trabajo en español.

El lector debe terminar entendiendo una decisión y pudiendo usarla. El atractivo visual ayuda a entrar; la explicación tiene que sostenerse cuando la animación termina.

## Referencias y estructuras observadas

Revisadas el 11 de septiembre de 2026. Estas observaciones describen los artículos enlazados; las reglas que siguen son decisiones editoriales de Inicio.

| Referencia | Recorrido observado | Aplicación |
| --- | --- | --- |
| [Drawesome](https://benji.org/drawesome) | Presentación y superficie utilizable, motivación, inicio mínimo, herramientas, personalización, referencia y cierre. | Una pieza distribuible puede empezar con lo necesario para probarla y dejar el catálogo de opciones al final. |
| [Morphing icons with Claude](https://benji.org/morphing-icons-with-claude) | Intención y resultado, restricción de construcción, refinamientos de las transiciones, herramienta para probarlas y reflexiones. | Un artículo de proceso gana claridad al dividirse por decisiones observables. Las comparaciones muestran por qué se tomó cada decisión. |
| [Liveline](https://benji.org/liveline) | Presentación, uso mínimo, capacidades con ejemplos, funcionamiento, referencia, situaciones exigentes y cierre. | Cada ejemplo demuestra una capacidad. Las pruebas difíciles explican los límites del componente. |

No todos los artículos necesitan instalación, props o una cronología. Para explicar un efecto, usar el recorrido por decisiones. Para presentar una biblioteca, añadir uso mínimo y referencia. Para investigar una técnica, organizar por hipótesis y comparaciones verificadas.

## Apertura: dar algo que mirar

En uno o dos párrafos, nombrar la observación concreta, enlazar su origen y definir qué se ha construido. Después, mostrar el resultado funcionando. El lector debe encontrarlo antes del primer desarrollo técnico largo.

Ejemplo original de apertura: “The coloured lines in Anthropic’s economic scenarios have little gaps where the paper shows through. I pulled the drawing into a standalone demo to see which parts produce that texture.”

Evitar aperturas como “Animation is an essential part of modern interfaces”: consumen atención sin explicar esta pieza. Tampoco inventar semanas de trabajo, intentos fallidos o una conversación con una herramienta para darle forma al relato.

## Dividir por preguntas que se puedan resolver

Antes de escribir una sección, completar esta ficha:

| Campo | Ejemplo para tinta SVG |
| --- | --- |
| Pregunta del lector | ¿De dónde salen los bordes irregulares? |
| Afirmación concreta | Un contorno permite variar la anchura a lo largo de una trayectoria. |
| Evidencia | La misma curva vista como línea central, perímetro y relleno. |
| Acción del lector | Alternar las tres vistas. |
| Transferencia | Calcular la normal de cada punto y desplazar ambos bordes. |

Si dos secciones responden la misma pregunta, unirlas. Si una sección necesita explicar varias causas independientes, separarlas. Los títulos deben nombrar la acción o idea: “Keep the wobble still” indica una decisión que “Technical implementation” deja sin precisar.

Una secuencia útil es: observación, mecanismo, ejemplo, consecuencia. El orden puede cambiar cuando ver el ejemplo primero permita entender el problema. Evitar repetir esa secuencia como una plantilla visible en todos los párrafos.

## Diseñar una demo que explique

- Mantener una referencia estable. Al comparar filtros, conservar trayectoria, semilla, color y tamaño.
- Añadir únicamente controles que respondan a la pregunta de la sección. Un panel con todos los parámetros obliga al lector a averiguar qué importa.
- Poner la instrucción junto a la superficie. “Turn off Multiply and look at the crossing” dirige la atención a una diferencia comprobable.
- Ofrecer Replay o progreso manual cuando la velocidad pueda ocultar el mecanismo. No obligar a perseguir una animación en bucle.
- Usar un estado inicial que ya muestre el efecto. La demo debe aportar algo aunque el lector no toque nada.
- Dejar que el texto sea legible con movimiento reducido y que todos los controles funcionen con teclado y en móvil.

La gracia puede vivir en una acción pequeña: cambiar una semilla produce otro trazo; un dato ficticio cotidiano da contexto a una minigráfica. Un comentario juguetón es suficiente. No convertir cada pie de figura en un chiste ni ocultar una explicación necesaria detrás de un gesto.

## Escribir la consecuencia, además del nombre técnico

Ejemplo vago: “We use seeded noise for a natural effect.”

Ejemplo útil: “The seed keeps the edge in the same place when the component renders again. Change it only when you want a different stroke.”

Usar primera persona para decisiones que Antonio pueda defender y segunda persona para acciones del lector. Preferir palabras habituales, detalles específicos y párrafos de longitud variable. Eliminar la celebración genérica del resultado, los remates solemnes y las frases que anuncian lo que viene en lugar de explicarlo.

Las afirmaciones sobre una referencia necesitan evidencia. Distinguir:

1. Observado en la interfaz: describir lo visible.
2. Verificado en el código público: explicar el mecanismo y registrar la fuente.
3. Decisión de esta adaptación: atribuirla a la demo de Inicio.
4. Inferencia: identificarla como tal o retirarla si no ayuda.

No atribuir al original una mejora local. No presentar el código inspeccionado como una entrevista con sus autores.

## Código y notas

Mostrar normalmente entre 3 y 12 líneas, tomadas de la implementación ejecutable. Si el fragmento depende de una utilidad, ofrecer el archivo completo y decir dónde encaja. Mantener los fragmentos sincronizados mediante regiones extraídas del código cuando sea sencillo.

Cada bloque debe contestar una pregunta de la sección. Una llamada pequeña puede ser suficiente para el uso; una fórmula puede ser necesaria para explicar el mecanismo. No incluir una referencia de API completa por imitación de un artículo sobre una biblioteca.

Usar notas para créditos ampliados, procedencia y límites secundarios. El detalle imprescindible para reproducir una demo pertenece al cuerpo del artículo.

## Composición de Inicio

Conservar la columna de 550 px, Geist a 14/20 px y el título discreto. Usar espacio y separadores finos para señalar secciones. Las superficies de demostración pueden tener papel y color propios; el resto de la página mantiene la apariencia de Inicio.

En escritorio amplio, un índice lateral permite saltar entre ideas. En pantallas pequeñas, llevarlo a un desplegable en el flujo. Los controles deben caber o envolverse; el código puede desplazarse dentro de su bloque. La página mantiene scroll normal.

## Plantilla de preparación

```text
Título concreto:
Origen / fuentes verificadas:
Qué podrá hacer el lector al terminar:

Apertura: observación + alcance de lo construido.
Primera demo: resultado completo y acción evidente.

Para cada sección:
  Pregunta que resuelve:
  Decisión o mecanismo:
  Comparación / evidencia:
  Control y consecuencia visible:
  Fragmento de código útil:

Ejemplo reutilizable:
Límite que el lector debería conocer:
Créditos y procedencia:
```

## Revisión antes de publicar

- ¿El lector ve el resultado al principio?
- ¿Cada sección enseña algo distinto que se puede comprobar?
- ¿Cambiar un control conserva las demás variables de la comparación?
- ¿Puede reutilizar la técnica con el código proporcionado?
- ¿Los fragmentos corresponden al ejemplo visible?
- ¿Las afirmaciones del original tienen fuente y las adaptaciones están identificadas?
- ¿La voz evita anécdotas inventadas y expresiones prestadas del autor de referencia?
- ¿Los pies de figura ayudan a mirar en el lugar correcto?
- ¿El artículo funciona en móvil, con teclado y con movimiento reducido?
- ¿El cierre aporta una aplicación o un límite concreto?

## Procedencia del artículo sobre tinta

Decisión editorial para este artículo: presentar la explicación y las demos sin código visible, botones de copiar ni descargas del código fuente. Evitar referencias a fragmentos que el lector no puede ver.

Base local: `/Users/txnio/econ-marker-demo/index.html`. Referencia: [Scenarios for our Economic Future](https://www.anthropic.com/institute/econ-scenarios).

El 11 de septiembre de 2026 se contrastaron el generador de contornos, las capas de tinta, los filtros completos y ligeros, y el revelado del abanico con el [JavaScript público servido por Anthropic](https://www.anthropic.com/_next/static/chunks/2bnydcp8p6u_h.js). La URL del archivo compilado puede cambiar. El filtro completo incluye grano y desplazamiento; el ligero omite el desplazamiento. Ambos pertenecen al original.

La adaptación de Inicio usa escenas didácticas, curvas sintéticas, controles propios y un revelado por segmentos simplificado. Ninguna gráfica de la demo representa una predicción económica. Consultar los créditos del artículo original para atribuir la experiencia; no inferir autoría individual de cada función a partir de ellos.
