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
    globals.css
  components/
    ZoneCard.tsx        # tarjeta clickeable de una zona
    ZoneModal.tsx        # modal con la lista de tareas de una zona
    TaskRow.tsx           # una tarea dentro del modal
  context/
    ProfileContext.tsx   # perfil activo, persistido en localStorage
  hooks/
    useHouseData.ts      # fetch de zonas, perfiles, tareas y completions
    useNow.ts             # reloj que se actualiza cada minuto
  lib/
    supabaseClient.ts     # cliente de Supabase
    data.ts                 # funciones de acceso a datos (fetch/insert)
    urgency.ts               # funciones puras: cálculo de estado/urgencia/color
  types/
    domain.ts                 # tipos compartidos (Profile, Zone, TaskTemplate, ...)
sql/
  schema.sql                    # creación de tablas, RLS y datos semilla
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
   de RLS y los datos semilla (perfiles, zonas y las 3 tareas iniciales de
   Comedor).

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

## Notas / alcance del MVP

- El login es simbólico: no hay contraseñas ni sesiones de servidor, solo
  selección de perfil guardada en `localStorage`. Cualquiera con el enlace
  puede entrar como cualquier perfil — suficiente para uso familiar privado,
  no apto para exponer públicamente sin agregar autenticación real.
- Las políticas de RLS son permisivas (lectura pública, inserción pública de
  completions) porque no hay autenticación real todavía.
- No hay notificaciones push ni recordatorios; el estado se recalcula al
  cargar la página y cada minuto mientras está abierta.
- Para agregar nuevas zonas o tareas, se puede hacer directamente desde el
  editor de tablas de Supabase (no hay UI de administración en el MVP).
