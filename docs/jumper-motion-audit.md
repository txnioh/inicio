# Auditoría de movimientos de Jumper

Fecha: 7 de octubre de 2026. Fuente: [KingKongRobotics/jumper](https://github.com/KingKongRobotics/jumper/tree/61d065219fca767f3142c8f10aff59eae5a5a004), commit `61d065219fca767f3142c8f10aff59eae5a5a004`.

## Reposo

El bundle no contiene una animación `idle`. Mantiene la política `locomotion`
(`jumper.posture`) con velocidad cero, postura neutra y fase de marcha `[0, 0]`.
La desactivación de la fase está en el [controlador original](https://github.com/KingKongRobotics/jumper/blob/61d065219fca767f3142c8f10aff59eae5a5a004/deploy/fsm/src/obs.rs#L60).

Había dos errores en el adaptador local:

- `mj_objectVelocity` usaba `mjOBJ_BODY`, que expresa la velocidad en el marco
  de inercia del CAD. La política requiere el marco del robot (`mjOBJ_XBODY`).
  El quaternion de inercia de la base es distinto del de su cuerpo. Véase la
  [distinción oficial de MuJoCo](https://mujoco.readthedocs.io/en/stable/APIreference/APItypes.html#mjtobj)
  y la [entrada del simulador original](https://github.com/KingKongRobotics/jumper/blob/61d065219fca767f3142c8f10aff59eae5a5a004/rl/mjrl/app_play.py#L579).
- Tras integrar, se combinaban articulaciones actuales con velocidades y poses
  derivadas del subpaso anterior. Ahora `mj_forward` las actualiza antes de
  dibujar y de la siguiente observación. Es la misma operación que hace el
  [simulador nativo](https://github.com/KingKongRobotics/jumper/blob/61d065219fca767f3142c8f10aff59eae5a5a004/rl/mjrl/backend/native_sim.py#L991).
  MuJoCo explica este [desfase de los datos derivados](https://mujoco.readthedocs.io/en/stable/programming/simulation.html#simulation-loop).

Prueba sobre suelo plano: 4 s de asentamiento y 60 s de reposo; 12 000 inferencias.
Velocidad solicitada, fase de marcha y desplazamiento de postura: cero durante
toda la prueba. Solo los motores de las articulaciones aplican fuerza.

| Medida física del cuerpo | Antes | Corregido |
| --- | ---: | ---: |
| Desviación estándar de altura | 0,362 mm | 0,090 mm |
| Rango de altura durante el minuto | 4,142 mm | 0,394 mm |
| Variación de altura entre ticks, RMS | 0,0405 mm | 0,0095 mm |
| Velocidad angular, RMS | 0,1475 rad/s | 0,0435 rad/s |
| Deriva horizontal máxima | 13,8 mm | 9,1 mm |

La desviación de altura disminuye un 75 %. Quedan pequeñas correcciones de la
política y deslizamiento de los contactos. El robot sigue siendo dinámico:
no se congela, no se filtran las acciones ni se añaden fuerzas para sujetarlo.
Son medidas del simulador, sin calibración contra hardware. El verificador usa
ahora la misma precisión del estado térmico que el navegador.

## Políticas y acciones

Los 38 archivos del bundle presentes localmente coinciden con los SHA-256 y
tamaños oficiales: controlador, contratos, trayectorias y 11 modelos ONNX para
12 modos. Las dos pinzas comparten modelo. La referencia oficial solo cubre
locomoción: 24 frames, 18 inferencias, error de observación/objetivo cero y
error ONNX nativo máximo `2,384e-7`. Los demás modos se verifican ejecutándolos
completos en la física, no mediante una referencia de paridad inexistente.

Resultado: los doce modos pasan. Las nueve referencias se ejecutan hasta el
final con el número esperado de inferencias y vuelven a locomoción; ambos modos
pinza salen mediante su interruptor original. No hay entradas en `safe`, estados
no finitos ni fuerzas externas aplicadas durante estas pruebas.

| Modo | Duración de referencia | Inferencias de referencia esperadas |
| --- | ---: | ---: |
| locomotion | continua | 12 000 en el minuto de reposo |
| claw_left / claw_right | continua | prueba de 20 s por modo y salida |
| dance_brazilian | 66,08 s | 3 304 |
| dance_crab | 235,68 s | 11 784 |
| dance_dream_wings | 55,60 s | 2 780 |
| dance_maze | 10,00 s | 500 |
| gesture_bow | 8,56 s | 428 |
| gesture_hello | 7,32 s | 366 |
| gesture_paw | 6,38 s | 319 |
| gesture_salute | 6,02 s | 301 |
| jump | 1,472 s, incluye 0,3 s antes del impulso | 236 a 200 Hz durante el tramo activo |

El selector también tenía un fallo: «Caminar» llamaba a `letGo`, que centra los
mandos pero mantiene el modo pinza activado. Ahora pulsa el botón de salida
definido por el propio controlador. Los eventos llegan en ticks consecutivos;
el selector respeta los estados de origen que permiten los bindings oficiales.

El salto mantiene la política vertical original. Con el IMU corregido alcanza
aproximadamente 22,95 cm de altura del cuerpo y aterriza. En el ensayo de avance
el robot toca la primera caja y queda delante: atravesarla no es un criterio
de éxito válido para una política sin garantía de superar ese obstáculo.

## Entorno de skate

El entorno y sus archivos no se modificaron en esta auditoría. Para integrarlo,
las superficies visibles y las colisiones deben compartir dimensiones en metros
y eje Z vertical. Las masas, fricciones y contactos nuevos pertenecen al entorno;
el controlador, contratos, modelos y trayectorias conservan su procedencia.

Las pruebas de políticas usan un suelo plano, desactivando las cajas solo en
memoria. El parque necesita además sus propias pruebas de contacto y estabilidad.
Un ollie, un salto dirigido o una maniobra de skate requerirían una política o
trayectoria con procedencia verificable; este bundle no demuestra esas habilidades.

Ejecutar: `node scripts/verify-jumper.mjs --all-modes`. Resultados completos:
[`output/jumper-motion-audit.json`](../output/jumper-motion-audit.json).
