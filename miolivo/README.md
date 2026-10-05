# MiOlivo

Gemelo digital del olivar, árbol a árbol. Cada olivo tiene una identidad
permanente y un historial por campaña, y la app responde a una pregunta:
**¿dónde tengo que actuar y cuánto me cuesta no hacerlo?**

Este primer prototipo web recorre el bucle del MVP
(**mapa → olivo → historial → problema → acción**) sobre una finca simulada.

## Qué hay

- **Mapa** de la finca (Canvas 2D) con unos 15.000 olivos dibujados a escala de
  copa. Capas: Estado, Vigor, Estrés hídrico, Copa Δ y Pérdida €. Arrastra para
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

## Qué está simulado

Todo. `src/model/generate.ts` genera a partir de una semilla la *Finca Las
Viñas*: 151 ha al norte de Jaén, 12 parcelas de olivar tradicional (secano y
goteo) e intensivo, y tres campañas de observaciones por árbol, como las que
darían un vuelo de dron RGB, multiespectral y térmico más la báscula de la
cooperativa. En la finca hay cuatro problemas plantados: un sector de goteo
averiado, un rodal con déficit de nitrógeno, filas sin podar desde 2022 y
varios focos de verticilosis. El diagnóstico no ve esas causas: solo las
observaciones.

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
