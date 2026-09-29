# Feature 002 – Pipeline de construcción y despliegue continuo

Como único usuario y mantenedor quiero que cada push a main resulte en una versión desplegada y verificada, sin pasos manuales:

- Todo pull request ejecuta lint, tests de backend y frontend y el build de producción; no se puede fusionar si falla.
- En cada merge a main se publica una imagen contenedorizada versionada (tag por SHA y latest) y se despliega al proveedor configurado; el despliegue falla si el healthcheck no responde en 60 s.
- La base de datos sobrevive a redeploys y se respalda automáticamente al menos una vez al día con retención de 14 días; existe un procedimiento documentado de restauración probado.
- El tiempo total de CI en PR debe ser menor a 5 minutos con caché de dependencias.
- Un desarrollador puede levantar el entorno completo en local con un solo comando.
- Estado del pipeline visible en el README (badge) y en la propia app (versión desplegada en el pie de página).

## Contexto técnico

GitHub Actions para CI/CD; imagen publicada en GHCR; destino de despliegue: Render usando el render.yaml existente (alternativa: Fly.io); respaldos con `sqlite3 .backup` subidos a un bucket S3-compatible mediante un job programado. Reutiliza el Dockerfile multi-stage existente y optimiza su caché de capas.
