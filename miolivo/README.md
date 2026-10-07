# MiOlivo

Gemelo digital del olivar, árbol a árbol. Cada olivo tiene una identidad
permanente y un historial por campaña, y la app responde a una pregunta:
**¿dónde tengo que actuar y cuánto me cuesta no hacerlo?**

Este primer prototipo web recorre el bucle del MVP
(**mapa → olivo → historial → problema → acción**) sobre una finca simulada.

## Qué hay

- **Mapa** de la finca (deck.gl, WebGL) con unos 15.000 olivos dibujados a escala de
  copa sobre la ortofoto real del PNOA (© IGN, CC BY 4.0), o sobre un plano. En
  **3D** cada olivo es un modelo generado en código (`src/map/olive-mesh.ts`)
  escalado a su copa y su altura, con sombra; clic derecho y arrastrar para girar. Capas: Estado, Vigor, Estrés hídrico, Copa Δ y Pérdida €. Arrastra para
  moverte; rueda, pellizco o doble clic para acercar; <kbd>Mayús</kbd> + arrastrar
  (o *Seleccionar área*) para seleccionar; <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + clic
  añade o quita un olivo; teclado: flechas, <kbd>+</kbd> <kbd>−</kbd> y <kbd>0</kbd>.
- **Deslizador temporal**: campañas 2024 y 2025 (cosecha pesada) y 2026 (previsión).
- **Ficha del olivo**: posición, parcela SIGPAC, variedad, volumen y evolución de
  copa, vigor, estrés hídrico, cosechas, poda, tratamientos, carbono, riesgo,
  tendencias, diagnóstico, recomendación y coste estimado de no actuar.
- **Anomalías** agrupadas por parcela y tipo, ordenadas por € en riesgo.
- **Tareas**: con la selección se crea una ruta (vecino más próximo + 2-opt
  desde la entrada) con las horas estimadas. Para cada olivo se registra si se
  confirmó el problema en campo o era un falso positivo. Un falso positivo
  deja de señalarse en ese olivo y la precisión de cada diagnóstico se muestra
  en *Lo que ha aprendido el gemelo*. Las tareas y los supuestos se guardan en
  este navegador.

## Qué es real y qué está simulado

**Real**: el terreno de la *Finca Las Viñas*, al sur de Villacarrillo (Jaén).

- Las lindes son 21 parcelas catastrales (114,7 ha), del servicio INSPIRE del
  Catastro, solo la geometría. La app les pone números inventados para no
  atribuir los problemas simulados a referencias catastrales reales.
- Cada olivo es una copa detectada en la ortofoto del PNOA (© IGN, CC BY 4.0),
  unos 15.000, con su posición y su diámetro de copa medidos. El detector
  (`scripts/detect-olives.ts`) es visión clásica, sin modelos: oscuridad
  frente al suelo de alrededor, descarte de lo que tiene tinte (placas
  solares, balsas), fusión de los lóbulos de un mismo olivo y centros por
  transformada de distancias.

**Simulado**, a partir de una semilla en `src/model/generate.ts`: lo que una foto
no dice. El manejo de cada parcela (secano o goteo, variedad, poda; el marco y
el sistema salen de la densidad real), la altura, y tres campañas de
observaciones por árbol, como las que darían un vuelo de dron multiespectral y
térmico más la báscula de la cooperativa. En la finca hay cuatro problemas
plantados: un sector de goteo averiado, un rodal con déficit de nitrógeno,
filas sin podar desde 2022 y varios focos de verticilosis. El diagnóstico no ve
esas causas: solo las observaciones.

Para regenerar el terreno (descarga unas 500 teselas, que se guardan en
`scripts/.cache`):

```sh
npm run build:farm   # escribe src/model/parcels.json y src/model/olives.json
```

## Cómo diagnostica y valora

- `src/model/analyze.ts` compara cada olivo con la mediana y la MAD de los
  olivos de su misma parcela en un radio de 150 m. Un foco entero no puede
  rebajar así su propia referencia. Señala estrés hídrico, pérdida de copa,
  vigor bajo y falta de poda, con dos niveles de gravedad (*Revisar*, *Actuar*).
- La previsión de 2026 parte del volumen de copa, la productividad de la
  parcela en la campaña de igual vecería (2024), la productividad propia del
  olivo y unos factores de vigor, estrés y altura relativos a su entorno.
- La pérdida es lo que daría el olivo al ritmo de la parcela, con su copa de
  referencia, menos lo que da o se prevé. Solo cuenta en olivos con anomalía.
- € = kg de aceituna × rendimiento graso × precio del aceite. Ambos son
  supuestos editables (20 % y 4 €/kg por defecto). El coste de no actuar
  amplía esa pérdida según cuánto tiende a progresar cada problema.

## Desarrollo

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # tests del modelo (Node 22.6+)
npm run build    # typecheck + build en dist/
```

Es un proyecto aparte del portfolio de la raíz. Para publicarlo, crea un
proyecto de Vercel con *Root Directory* `miolivo`.
