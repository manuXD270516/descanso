# Quickstart: validar la feature 008

Contratos en [contracts/openapi-delta.yaml](contracts/openapi-delta.yaml); esquema en
[data-model.md](data-model.md).

## 1. Puertas automáticas

```bash
cd backend && npm test && npm run lint
cd frontend && npx ng lint && npx ng test --watch=false --browsers=ChromeHeadless && npx ng build
cd e2e && npm test
```

Incluyen:
- `isolation.test.js`: dos usuarios, todas las rutas, 404 para lo ajeno;
- `schema-isolation.test.js`: toda tabla clasificada;
- `routes-no-db.test.js`: las rutas no llaman a `db.prepare`;
- migración 005 sobre datos legacy y compatibilidad con 004.

## 2. Compatibilidad con la versión anterior

Imagen de master (004) sobre una base migrada por 008: arranca, el propietario entra y opera.

```bash
docker run --rm -e DB_PATH=/data/sleep.db -e OWNER_SETUP_TOKEN=<el mismo> -v "$PWD/tmp/compat:/data" -p 3998:3000 ghcr.io/manuxd270516/descanso:<sha-master>
```

## 3. Invitar y aislar (US1, US2) en local

1. Arranca con `OWNER_SETUP_TOKEN` y entra como propietario.
2. Cuenta → Personas → "Invitar a alguien" → copia el enlace.
3. En una ventana privada, abre el enlace: texto de transparencia, política y aceptación →
   registro. La app está vacía, con 3 métricas.
4. Registra una noche en cada ventana: cada una ve solo la suya.
5. Reutiliza el enlace → "Esta invitación no es válida".

## 4. Perfil y recuperación (US3, US4)

- Perfil: nombre, zona (propuesta), objetivo 7 h 30 → recargar → persisten.
- Cambiar la contraseña con la sesión abierta en otra ventana → la otra vuelve a "Entrar".
- Propietario → Personas → "Enlace de recuperación" para la invitada → en su ventana, abrir el
  enlace y fijar una contraseña → al entrar ve el aviso; en Perfil → Actividad aparece la acción.

## 5. Borrado (US5)

- Invitada → Perfil → Borrar mi cuenta (con contraseña) → 0 filas suyas
  (`isolation.test.js` lo verifica en todas las tablas).
- Propietario con otra persona registrada → "Borrar mi cuenta" → 409 con la explicación.

## 6. Respaldos cifrados (US7)

Una sola vez, en tu máquina:

```bash
age-keygen -o descanso-backup.key        # guarda este archivo en tu gestor de contraseñas
gh secret set BACKUP_AGE_RECIPIENT --body "$(grep -o 'age1[0-9a-z]*' descanso-backup.key)"
```

Lanza Actions → Backup → el objeto subido termina en `.db.age`. Restauración: ver
`docs/runbooks/restaurar-respaldo.md` (`age -d -i descanso-backup.key …`).

## 7. Producción

Tras fusionar: `flyctl logs` → `[migraciones] aplicadas: 5`. Entra como propietario, invita a una
persona de confianza y repite §3 con su dispositivo.
