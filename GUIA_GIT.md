# Comandos para subir al repositorio GitHub

## Crear nuevo repositorio

### 1. En GitHub.com:
1. Ve a https://github.com/new
2. Nombre: `showrooms-comisiones` (o el que prefieras)
3. Descripción: `Sistema de comisiones de showrooms - Charo Ruiz Ibiza`
4. Público o Privado (recomendado: Privado)
5. NO inicialices con README (ya lo tenemos)
6. Click en "Create repository"

### 2. En tu ordenador:

```bash
# Ir a la carpeta del proyecto
cd showrooms-comisiones

# Inicializar Git
git init

# Añadir todos los archivos
git add .

# Primer commit
git commit -m "feat: sistema completo de comisiones de showrooms"

# Conectar con GitHub (reemplaza TU-USUARIO con tu usuario de GitHub)
git remote add origin https://github.com/TU-USUARIO/showrooms-comisiones.git

# Subir al repositorio
git push -u origin main
```

## Si ya existe el repositorio

```bash
# Clonar el repositorio
git clone https://github.com/TU-USUARIO/showrooms-comisiones.git
cd showrooms-comisiones

# Copiar los archivos nuevos aquí

# Ver cambios
git status

# Añadir todos los cambios
git add .

# Hacer commit
git commit -m "feat: sistema completo con todas las funcionalidades"

# Subir
git push origin main
```

## Activar GitHub Pages

1. Ve a: `https://github.com/TU-USUARIO/showrooms-comisiones/settings/pages`
2. En "Source" selecciona: **main** branch
3. Carpeta: **/ (root)**
4. Click en "Save"
5. Espera 1-2 minutos
6. Tu app estará en: `https://TU-USUARIO.github.io/showrooms-comisiones`

## Estructura de archivos

```
showrooms-comisiones/
├── index.html          # Página principal
├── styles.css          # Estilos
├── app.js              # Lógica JavaScript
├── README.md           # Documentación
├── .gitignore          # Archivos a ignorar
└── GUIA_GIT.md         # Este archivo
```

## Comandos útiles

### Ver estado
```bash
git status
```

### Ver historial
```bash
git log --oneline
```

### Crear rama nueva
```bash
git checkout -b nueva-funcionalidad
```

### Volver a main
```bash
git checkout main
```

### Actualizar desde GitHub
```bash
git pull origin main
```

## Mensajes de commit recomendados

Usa prefijos para organizar mejor:

- `feat:` - Nueva funcionalidad
  ```bash
  git commit -m "feat: añadir filtro de fecha en dashboard"
  ```

- `fix:` - Corrección de error
  ```bash
  git commit -m "fix: corregir cálculo de saldo residual"
  ```

- `docs:` - Documentación
  ```bash
  git commit -m "docs: actualizar README con ejemplos"
  ```

- `style:` - Cambios visuales
  ```bash
  git commit -m "style: mejorar diseño de modales"
  ```

- `refactor:` - Refactorización
  ```bash
  git commit -m "refactor: optimizar función de cálculo de comisiones"
  ```

## Compartir con otros usuarios

### Opción 1: GitHub Pages (recomendado)
Una vez activado GitHub Pages, simplemente comparte la URL:
```
https://TU-USUARIO.github.io/showrooms-comisiones
```

### Opción 2: Colaboradores
1. Settings → Collaborators
2. Add people
3. Invita por email o usuario

### Opción 3: Hacer repositorio público
Settings → Change repository visibility → Make public

## Backup de datos

Recuerda que el sistema usa localStorage. Para hacer backup:

1. Usa los botones "Exportar" en cada sección
2. Guarda los archivos Excel generados
3. Sube los backups a un lugar seguro (OneDrive, Google Drive, etc.)

**NO subas datos reales al repositorio de GitHub** - Usa .gitignore para excluirlos.

## Solución de problemas

### Error: remote origin already exists
```bash
git remote remove origin
git remote add origin https://github.com/TU-USUARIO/showrooms-comisiones.git
```

### Error: Updates were rejected
```bash
git pull origin main --rebase
git push origin main
```

### Deshacer último commit (sin perder cambios)
```bash
git reset --soft HEAD~1
```

### Deshacer cambios en un archivo
```bash
git checkout -- archivo.js
```

## Mantener actualizado

```bash
# Ver qué hay nuevo en GitHub
git fetch origin

# Traer cambios
git pull origin main

# Subir tus cambios
git add .
git commit -m "descripción del cambio"
git push origin main
```

---

**¿Necesitas ayuda?**
- GitHub Docs: https://docs.github.com
- Git Guía: https://git-scm.com/docs
