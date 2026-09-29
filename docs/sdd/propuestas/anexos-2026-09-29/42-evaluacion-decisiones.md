# Evaluación tras las decisiones del usuario (P1, P2, P5)

El usuario dio tres respuestas el 2026-09-29:

- **P1 = sí**: habrá varios usuarios, cada uno con su perfil.
- **P2 = Huawei Band** con Huawei Health en Android. La factibilidad está en [16-react-G-huawei](16-react-G-huawei.md).
- **P5 = Android**. Por eso se descarta la 012 (PWA).

Con esas respuestas se evaluaron dos features:

- **008**, ahora una entrada completa y adelantada para ir justo después de 004;
- **007**, con Huawei como P1.

Se aplicó la misma rúbrica ([00-rubrica.md](00-rubrica.md)) con el mismo evaluador independiente, en un máximo de dos rondas.

| Feature | Ronda 1 | Revisiones | Ronda 2 | Veredicto |
|---------|---------|------------|---------|-----------|
| 008 Multiusuario con perfiles | 4,30 · revisión | V-24 a V-26, V-30 | 4,45 | **Aprobada** |
| 007 Importar reloj (Huawei P1, Apple P2) | 3,80 · revisión | V-27 a V-29 | 4,10 | **Aprobada**, sujeta al spike con la exportación real y a confirmar el modelo |

## Revisiones

- **V-24.** La enmienda MINOR del principio II (borrado a petición) se adelanta: ahora se aplica antes del plan de 008.
- **V-25.** Se quitan las "unidades" del perfil (YAGNI).
- **V-26.** Se corrige una promesa de privacidad falsa: el administrador sí tiene acceso técnico, y el texto ahora lo dice con honestidad. Además:
  - la recuperación de contraseña cierra las sesiones abiertas y avisa al usuario;
  - la recuperación queda en un `audit_log` visible para el usuario;
  - `OWNER_SETUP_TOKEN` solo aplica al propietario;
  - la contracción del DEFAULT se hace en un despliegue aparte.
- **V-27.** Si falla el spike de Apple, solo cae la historia de Apple. Se añade un criterio de memoria en Chrome para Android.
- **V-28.** Huawei guarda epoch sin offset. La hora local se calcula con `Intl` y la zona horaria del perfil. Además:
  - las sesiones se agrupan cuando los huecos son menores de 30 min;
  - `external_id` = sha256 de los datos de la sesión;
  - la regla III tiene tests;
  - el límite con los viajes se explica al usuario.
- **V-29.** El export real nunca se sube al repositorio. Además:
  - los fixtures son sintéticos o anonimizados;
  - solo `PROFESSIONAL_SLEEP_*` sale del navegador;
  - hay que confirmar si es Huawei o Honor.
- **V-30.** Todas las features posteriores (005, 006, 007, 010 y 011) se añaden a la suite de aislamiento de 008. La bienvenida se muestra una vez por usuario.

## Estado del conjunto

| Estado | Features |
|--------|----------|
| Aprobadas | 003, 004, 008, 005, 006, 010, 011, 007 |
| Condicionadas | 009 (opcional, vía Health Sync) y 013 (techo de coste) |
| Descartada | 012 (Android) |

Veredicto: **listo para presentar al usuario**.
