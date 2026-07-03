# enCasa

App web familiar para organizar las tareas diarias de la casa. Pantalla
principal en forma de mapa de la casa: cada zona es una tarjeta que cambia de
color según qué tan cerca (o vencidas) están sus tareas pendientes.

## Stack

- Next.js 15 (App Router) + TypeScript
- Supabase (Postgres) como base de datos
- Deploy en Vercel
- Sin autenticación real: login simbólico por selección de perfil, guardado en `localStorage`

## Estructura del proyecto

```
src/
  app/
    layout.tsx        # layout raíz, envuelve todo en ProfileProvider
    page.tsx           # pantalla principal (mapa de zonas)
    login/page.tsx      # selección de perfil
    tareas/page.tsx      # panel de administración de tareas
    historial/page.tsx    # historial de tareas completadas
    globals.css
  components/
    ZoneCard.tsx        # tarjeta clickeable de una zona
    ZoneModal.tsx        # modal con la lista de tareas de una zona
    TaskRow.tsx           # una tarea dentro del modal
    TaskForm.tsx           # formulario crear/editar tarea (usado en /tareas)
  context/
    ProfileContext.tsx   # perfil activo, persistido en localStorage
  hooks/
    useHouseData.ts      # fetch de zonas, perfiles, tareas y completions
    useTaskAdminData.ts   # fetch de zonas, perfiles y TODAS las tareas (para /tareas)
    useTaskHistory.ts      # fetch del historial de completions (para /historial)
    useNow.ts             # reloj que se actualiza cada minuto
  lib/
    supabaseClient.ts     # cliente de Supabase
    data.ts                 # funciones de acceso a datos (fetch/insert/update)
    slug.ts                   # genera el id de una tarea nueva a partir de zona+título
    urgency.ts               # funciones puras: cálculo de estado/urgencia/color
  types/
    domain.ts                 # tipos compartidos (Profile, Zone, TaskTemplate, ...)
sql/
  schema.sql                                   # creación de tablas, RLS y datos semilla
  patch-assign-initial-responsibles.sql          # asigna responsables a las tareas seed
  patch-task-template-write-policies.sql          # habilita insert/update de task_templates
```

La lógica de urgencia vive completamente en `src/lib/urgency.ts` como
funciones puras (sin dependencias de red ni de UI), para que sea fácil de
testear y razonar sobre ella.

## Modelo de datos

- `profiles`: perfiles simbólicos (id, name).
- `zones`: zonas de la casa (id, name, sort_order).
- `task_templates`: definición recurrente de una tarea (zona, a quién está
  asignada, tipo de recurrencia, horarios/intervalo).
- `task_completions`: cada vez que alguien marca una tarea como hecha, se
  inserta un registro con quién y cuándo.

### Reglas de urgencia (resumen)

- **daily** con `active_from` y `due_time`: se calcula un progreso lineal
  entre esas dos horas del día actual.
  - `< 0.5` → verde · `< 0.75` → amarillo · `< 1` → naranja · `>= 1` → rojo
  - Se considera completada si existe una `task_completion` con
    `completed_at` de hoy.
- **every_n_days**: se calculan los días desde la última `task_completion` y
  se compara contra `interval_days` con los mismos umbrales de progreso.
  - Si nunca se ha completado, se asume que la tarea está totalmente vencida
    (progreso = 1) para que no quede "escondida" indefinidamente.
  - Se considera completada para el ciclo actual si la última completion fue
    hoy mismo.
- El color de una **zona** es el peor color entre sus tareas pendientes
  aplicables hoy (rojo > naranja > amarillo > verde). Si no tiene tareas
  pendientes, la zona se muestra en verde.

## Requisitos previos

- Node.js 18.18+ (recomendado 20+)
- Una cuenta y proyecto de [Supabase](https://supabase.com)

## Instalación local

1. Instalar dependencias:

   ```bash
   npm install
   ```

2. Crear el proyecto en Supabase y ejecutar el script `sql/schema.sql` en el
   **SQL editor** del panel de Supabase. Esto crea las tablas, las políticas
   de RLS (incluyendo insert/update de `task_templates` para el panel
   `/tareas`) y los datos semilla (perfiles, zonas y las 3 tareas iniciales
   de Comedor).

   Si ya tenías una base creada con una versión anterior de `schema.sql`,
   corre además los patches en `sql/` (ver sección "Panel de administración
   de tareas" más abajo) en vez de recrear las tablas.

3. Copiar el archivo de variables de entorno de ejemplo:

   ```bash
   cp .env.local.example .env.local
   ```

4. Completar `.env.local` con los datos de tu proyecto de Supabase (Project
   Settings → API):

   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key
   ```

5. Levantar el entorno de desarrollo:

   ```bash
   npm run dev
   ```

6. Abrir [http://localhost:3000](http://localhost:3000). Como no hay perfil
   activo, redirige a `/login`; al elegir un perfil se guarda en
   `localStorage` y se entra al mapa de la casa.

## Variables de entorno

| Variable                        | Descripción                                   |
| -------------------------------- | ---------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`       | URL del proyecto de Supabase                   |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`  | Clave anónima (pública) del proyecto Supabase  |

Ambas son públicas (`NEXT_PUBLIC_*`) porque la app corre enteramente en el
cliente contra la API de Supabase, protegida por las políticas de RLS
definidas en `sql/schema.sql`.

## Deploy en Vercel

1. Subir el repositorio a GitHub (u otro proveedor soportado por Vercel).
2. En Vercel, "Add New Project" → importar el repositorio.
3. En **Environment Variables**, agregar `NEXT_PUBLIC_SUPABASE_URL` y
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` con los mismos valores que en
   `.env.local`.
4. Deploy. Vercel detecta Next.js automáticamente (build command
   `next build`, output `.next`).

## Panel de administración de tareas (`/tareas`)

Desde el mapa principal, el enlace "Administrar tareas" lleva a `/tareas`,
donde se puede:

- Ver todas las tareas (activas y desactivadas) agrupadas por zona.
- Crear una tarea nueva (título, zona, responsable, recurrencia).
- Editar el título, la zona, el responsable y la recurrencia de una tarea
  existente.
- Desactivar una tarea (`enabled = false`) o reactivarla (`enabled = true`).

**No hay borrado físico**: desactivar es la única forma de "quitar" una
tarea, para no perder el historial de `task_completions` que la referencia.
Una tarea desactivada deja de aparecer como pendiente en el mapa y en el
modal de su zona (el fetch del mapa ya filtraba por `enabled = true`).

El id de una tarea nueva se genera en el cliente a partir de la zona y el
título (p. ej. `comedor-limpiar-ventanas`); si ya existe ese id, se le agrega
un sufijo de timestamp.

Para que `/tareas` pueda escribir en `task_templates`, la base necesita las
políticas de RLS de insert/update. Si instalas desde cero con
`sql/schema.sql` ya las incluye. Si tu base es anterior a este panel,
corre una sola vez:

```bash
sql/patch-task-template-write-policies.sql
```

## Historial de tareas (`/historial`)

El enlace "Historial" (en el mapa y en `/tareas`) lleva a `/historial`, que
muestra las últimas 50 `task_completions`, más recientes primero, con:

- título de la tarea y zona,
- quién la completó y cuándo,
- el responsable original de la tarea (si tiene uno asignado).

Se puede filtrar por persona y por zona (las opciones salen de las propias
completions cargadas, no de un fetch aparte); el botón "Limpiar filtros"
resetea ambos. Solo usa la política de lectura de `task_completions` que ya
existía — no requiere ningún patch de SQL nuevo.

## Notas / alcance del MVP

- El login es simbólico: no hay contraseñas ni sesiones de servidor, solo
  selección de perfil guardada en `localStorage`. Cualquiera con el enlace
  puede entrar como cualquier perfil — suficiente para uso familiar privado,
  no apto para exponer públicamente sin agregar autenticación real.
- Las políticas de RLS son permisivas (lectura pública, inserción pública de
  completions, y desde el panel `/tareas` también inserción/edición de
  `task_templates`) porque no hay autenticación real todavía. Cualquiera con
  la anon key puede crear o editar tareas — aceptable para uso familiar
  privado, **no apto para datos sensibles ni para exponer la app
  públicamente** sin agregar autenticación real y políticas más estrictas.
- No hay notificaciones push ni recordatorios; el estado se recalcula al
  cargar la página y cada minuto mientras está abierta.
- Para agregar nuevas zonas, se puede hacer directamente desde el editor de
  tablas de Supabase (el panel `/tareas` solo administra `task_templates`).
