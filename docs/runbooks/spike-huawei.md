# Spike de Huawei Health (requisito previo de 007)

Sirve para saber si tu exportación de Huawei Health trae el sueño por fases, y cómo, **antes** de
planificar la importación del reloj (`specs/007-importar-reloj/spec.md`, sección «Requisito previo»).
Todo corre en tu PC: el script no usa red, no escribe nada (salvo el informe si lo pedís) y solo
imprime datos agregados.

> **La exportación real nunca entra en el repositorio** ni en commits, fixtures, registros o chats.
> Guardala y descomprimila fuera de la carpeta del proyecto.

## 1. Pedir la exportación

Cualquiera de las dos vías (la segunda suele traer más detalle):

- **Desde la app Huawei Health**: Yo (perfil) > Ajustes > Privacidad > **Gestionar datos / Descargar
  mis datos** (el texto exacto cambia según la versión). Indicá que querés los datos de salud y de
  sueño.
- **Centro de privacidad de Huawei** (privacy.consumer.huawei.com, con tu cuenta Huawei): **Solicitar
  los datos** y marcá *Huawei Health / Salud*. Huawei prepara el archivo y avisa; el enlace de
  descarga vence en pocos días.

El ZIP llega **cifrado con contraseña** (la contraseña te la manda Huawei por separado, a tu correo o
a tu teléfono).

## 2. Descomprimir con 7-Zip, fuera del repo

1. Abrí el ZIP con 7-Zip (clic derecho > 7-Zip > Extraer en...).
2. Destino fuera del proyecto, por ejemplo `D:\datos\huawei`. Si el ZIP trae otros ZIP dentro,
   extraelos también en esa carpeta.
3. Escribí la contraseña cuando 7-Zip la pida. No la guardes en ningún archivo del repo.

## 3. Correr el spike

Hace falta Node 22 (el del proyecto). Desde la raíz del repositorio:

PowerShell:

```powershell
node scripts/spike-huawei.mjs D:\datos\huawei
node scripts/spike-huawei.mjs D:\datos\huawei --salida D:\datos\informe-spike.txt
```

Git Bash:

```bash
node scripts/spike-huawei.mjs /d/datos/huawei
node scripts/spike-huawei.mjs /d/datos/huawei --salida /d/datos/informe-spike.txt
```

Con `--salida` el informe va al archivo (guardalo fuera del repo); sin esa opción, a la consola.

Para ver cómo se ve el informe sin tus datos, podés generar la exportación sintética de prueba:
`node scripts/fixtures/huawei-sintetico/generar.mjs D:\datos\sintetico` y correr el spike sobre esa
carpeta. La prueba automática es `node --test scripts/spike-huawei.test.mjs`.

## 4. Qué parte del informe es seguro pegar en el chat

El informe está pensado para pegarse **entero**: solo trae nombres de claves y de tipos con sus
conteos, la escala de las marcas de tiempo, porcentajes, la mediana de duración en minutos, la
cantidad de meses y un ejemplo de estructura con cada valor reemplazado por su tipo. No imprime
fechas, horas, valores, identificadores de dispositivo ni nombres.

Aun así, antes de pegar, leelo una vez con ojo humano:

- **Rutas de archivo**: salen con los números de 4 o más cifras enmascarados, pero si alguna carpeta
  o archivo lleva tu nombre u otro dato personal, tachalo.
- **Nombres de claves y de tipos**: deberían ser cosas como `PROFESSIONAL_SLEEP_DEEP`, `startTime`,
  `samplePoints`. Si ves algo que parezca un dato tuyo, no lo pegues.

**Nunca** pegues archivos de la exportación, ni fragmentos de ellos, ni capturas de las carpetas.

Qué mirar en el informe, por pregunta de la spec:

1. **Fases legibles**: los conteos por fase (`ligero`, `profundo`, `rem`, `despierto`, `siesta`) y los
   nombres de tipo encontrados.
2. **Escala del tiempo**: `milisegundos` o `segundos` (si dice que hay mezcla, avisalo).
3. **Repetición entre archivos**: el porcentaje de tramos presentes en más de un archivo.
4. **Corte de sesiones**: el histograma de huecos y la cantidad de sesiones con 15, 30 y 60 minutos.
   Si las tres dan casi lo mismo y las sesiones por mes rondan las noches reales, el hueco de 30 min
   sirve.

El último bloque es el **veredicto del criterio de salida**: *¿se pueden obtener noches con fases?*
`SÍ`, `NO` o `DUDOSO`, con el motivo. Si es `NO`, 007 se reduce a Apple Health y CSV (spec).

## 5. Al terminar: borrá lo descomprimido

Cuando tengas el informe, borrá la carpeta descomprimida (y el informe si ya no lo necesitás):

```powershell
Remove-Item -Recurse -Force D:\datos\huawei
```

Son datos de salud: no los dejes sueltos en el disco, en la nube sincronizada ni en la papelera. Si
querés conservar el ZIP original, que quede cifrado y fuera del repositorio.
