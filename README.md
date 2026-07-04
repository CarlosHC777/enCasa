# enCasa

App web familiar para organizar las tareas diarias de la casa. Pantalla
principal en forma de mapa de la casa: cada zona es una tarjeta que cambia de
color según qué tan cerca (o vencidas) están sus tareas pendientes.

Está optimizada para uso principal en celular: header, mapa, modal de zona,
`/tareas`, el formulario de tareas y `/historial` están pensados primero para
pantallas chicas (cards grandes, botones de ancho completo, filtros
apilados), y en pantallas más anchas el mapa se acomoda como un plano de
casa.

## Estado del release

**v0.2.0 candidate.** Incluye:

- Mapa de casa (`/`)
- Administración de tareas (`/tareas`)
- Historial de tareas completadas (`/historial`)
- PIN familiar (`/pin`)
- Responsive optimizado para móvil

## Stack

- Next.js 15 (App Router) + TypeScript
- Supabase (Postgres) como base de datos
- Deploy en Vercel
- Sin autenticación real: login simbólico por selección de perfil, guardado en `localStorage`

## Estructura del proyecto

```
src/
  middleware.ts       # protege las rutas de la app detrás del PIN familiar
  app/
    layout.tsx        # layout raíz, envuelve todo en ProfileProvider
    page.tsx           # pantalla principal (mapa de zonas)
    login/page.tsx      # selección de perfil
    score/page.tsx        # score diario en barras de progreso
    mi-tablero/page.tsx    # tablero de tareas del perfil activo
    tareas/page.tsx      # panel de administración de tareas (búsqueda + orden)
    historial/page.tsx    # historial de tareas completadas
    pin/page.tsx           # pantalla de PIN familiar
    api/pin/login/route.ts  # POST: valida el PIN y setea la cookie
    api/pin/logout/route.ts # POST: borra la cookie del PIN
    globals.css
  components/
    ZoneCard.tsx        # tarjeta clickeable de una zona
    ZoneModal.tsx        # modal con la lista de tareas de una zona
    TaskRow.tsx           # una tarea dentro del modal
    TaskForm.tsx           # formulario crear/editar tarea (usado en /tareas)
    UrgencyLegend.tsx        # leyenda de colores del mapa (Bien/Próxima/Urgente/Vencida)
    Clock.tsx                 # reloj visible (hora + fecha) en la pantalla principal
    DailyScoreBoard.tsx        # score diario (casa + personas) en barras de progreso
    BoardTaskCard.tsx           # tarjeta de tarea del tablero por perfil (/mi-tablero)
  context/
    ProfileContext.tsx   # perfil activo, persistido en localStorage
  hooks/
    useHouseData.ts      # fetch de zonas, perfiles, tareas y completions
    useTaskAdminData.ts   # fetch de zonas, perfiles y TODAS las tareas (para /tareas)
    useTaskHistory.ts      # fetch del historial de completions (para /historial)
    useDailyScore.ts        # deriva el score diario de los datos ya cargados
    useNow.ts             # reloj que se actualiza cada minuto
  lib/
    supabaseClient.ts     # cliente de Supabase
    data.ts                 # funciones de acceso a datos (fetch/insert/update)
    slug.ts                   # genera el id de una tarea nueva a partir de zona+título
    urgency.ts               # funciones puras: cálculo de estado/urgencia/color
    schedule.ts               # funciones puras: ocurrencias diarias, ventana de gracia, covered_due_at
    dailyScore.ts             # funciones puras: ocurrencias y score diario
    pinAuth.ts                 # cookie/HMAC del PIN (compartido por API routes y middleware)
    pinClient.ts                 # helper de cliente para cerrar la sesión de PIN
    floorPlans.ts                 # qué zonas van en cada piso del selector del mapa
  types/
    domain.ts                 # tipos compartidos (Profile, Zone, TaskTemplate, ...)
sql/
  schema.sql                                   # creación de tablas, RLS y datos semilla
  patch-assign-initial-responsibles.sql          # asigna responsables a las tareas seed
  patch-task-template-write-policies.sql          # habilita insert/update de task_templates
  patch-add-floor-zones.sql                       # agrega las zonas de 1er/2do piso
  patch-add-escaleras-servicio-piso1.sql            # agrega la escalera de servicio del 1er piso
  patch-task-due-times.sql                        # agrega due_times[] y created_at (horarios múltiples)
  patch-completion-covered-due-at.sql             # agrega covered_due_at a task_completions (gracia 2h)
```

La lógica de urgencia vive completamente en `src/lib/urgency.ts` como
funciones puras (sin dependencias de red ni de UI), para que sea fácil de
testear y razonar sobre ella.

## Modelo de datos

- `profiles`: perfiles simbólicos (id, name).
- `zones`: zonas de la casa (id, name, sort_order).
- `task_templates`: definición recurrente de una tarea (zona, a quién está
  asignada, tipo de recurrencia, horarios/intervalo). Para tareas diarias, los
  horarios de vencimiento viven en `due_times text[]` (fuente de verdad);
  `due_time`/`active_from` quedan como legacy. `created_at` marca desde cuándo
  cuentan sus vencimientos.
- `task_completions`: cada vez que alguien marca una tarea como hecha, se
  inserta un registro con quién y cuándo.

### Reglas de urgencia (resumen)

- **daily** con **horarios múltiples de vencimiento** (`due_times`): una tarea
  diaria puede vencer varias veces al día (ej. `09:00`, `18:00`, `22:00`).
  - Modelo de "ocurrencias con ventana de gracia" (en `src/lib/schedule.ts`):
    partiendo de `created_at` (anchor) se generan los vencimientos respetando
    `active_days`. Cada vencimiento tiene una **ventana de gracia de 2 h**
    (`dueAt` … `dueAt + 2h`) para poder cubrirlo. Ver la sección "Ventana de
    gracia" más abajo.
  - El progreso hacia el vencimiento pendiente da el color:
    `< 0.5` → verde · `< 0.75` → amarillo · `< 1` → naranja · `>= 1` → rojo.
  - La ocurrencia pendiente es la más antigua sin cubrir cuya gracia sigue
    abierta. Mientras la gracia está abierta y ya pasó la hora, la tarea se ve
    **roja**; si la gracia expira sin completarse, esa ocurrencia queda
    **perdida** y la tarea avanza sola al siguiente vencimiento.
  - No hay crash con tareas legacy: si no hay `due_times` se usa `due_time`
    como único horario; si no hay ninguno, la tarea se muestra en verde.
- **every_n_days**: se calculan los días desde la última `task_completion` y
  se compara contra `interval_days` con los mismos umbrales de progreso.
  - Si nunca se ha completado, se asume que la tarea está totalmente vencida
    (progreso = 1) para que no quede "escondida" indefinidamente.
  - Se considera completada para el ciclo actual si la última completion fue
    hoy mismo.
- El color de una **zona** es el peor color entre sus tareas pendientes
  aplicables hoy (rojo > naranja > amarillo > verde). Si no tiene tareas
  pendientes, la zona se muestra en verde.

### Colores y etiquetas de estado

Cada tarea/zona pasa de **verde → amarillo → naranja → rojo** según qué tan
cerca está del límite (mientras más cerca de vencerse, peor el color). En la
UI cada color tiene una etiqueta corta (mapa y leyenda) y una más
descriptiva (dentro del modal de zona):

| Color   | Etiqueta corta (zona) | Etiqueta larga (tarea)   |
| ------- | ---------------------- | -------------------------- |
| Verde   | Bien                   | Lejos del límite            |
| Amarillo| Próxima                | Acercándose                 |
| Naranja | Urgente                | Muy cerca del límite        |
| Rojo    | Vencida                | Vencida                     |

`src/lib/urgency.ts` expone `getUrgencyVisual(status)` (con `status`,
`progress`, `isOverdue`, `label`, `shortLabel`, `nextDueAt` y `overdueSince`)
para que los componentes no dupliquen esta lógica. Una tarea `every_n_days`
completada hoy (o dentro de su ciclo) deja de afectar el color de su zona.

## Score diario y reloj

La pantalla principal (`/`) muestra un **reloj** (hora + fecha, se actualiza
cada minuto vía el hook `useNow`). El **score diario** vive en su propia ruta
**`/score`** (enlazada desde el header de todas las pantallas): muestra el
progreso por persona y de toda la casa como **barras de progreso de colores**,
calculado para el **día local del navegador**.

El cálculo es una función pura en `src/lib/dailyScore.ts`
(`calculateDailyScore`), derivada de los datos ya cargados por `useHouseData`
(no hace consultas extra ni crea tablas). El hook `src/hooks/useDailyScore.ts`
lo memoiza.

### Cómo se calcula

Se generan las **ocurrencias de vencimiento del día** de cada tarea `enabled`
y con responsable (`assigned_to` no null):

- **daily**: una ocurrencia por cada horario de `due_times` (o 1 por
  `due_time` legacy). Si hoy no es día activo (`active_days`), la tarea no
  genera ocurrencias. Ejemplo: `due_times = ["09:00","18:00","22:00"]` cuenta
  como **3 ocurrencias** del día.
- **every_n_days**: **1 ocurrencia** si la tarea vence o toca hoy (o fue
  completada hoy); si aún no toca, no cuenta para el día. "Toca/vence hoy" se
  determina reutilizando `computeTaskStatus` (`state === "overdue"`, que cubre
  también las tareas sin historial).

Luego, por persona: `completadas / asignadas` del día. Reglas:

- Las completions de **hoy** cubren ocurrencias 1 a 1, con **tope** en el
  número de ocurrencias (5 completions sobre una tarea de 3 ocurrencias
  cuentan como 3, no 5).
- Una ocurrencia cuenta como completada para el **responsable asignado**
  aunque la haya completado otra persona. En `/historial` se sigue mostrando
  quién la completó realmente.
- El score de la **casa** es la suma de las ocurrencias de todas las personas.
- Si una persona no tiene ocurrencias hoy (`totalAssignedToday = 0`) se
  muestra **"Sin tareas para hoy"** en vez de un porcentaje.
- Tareas **desactivadas** o **sin responsable** no cuentan para el score.

### Reinicio automático por día

El score **no borra ni modifica** `task_completions`: se recalcula en cada
render filtrando las completions al día local actual. Al cambiar de día (el
reloj cruza medianoche y `useNow` actualiza la fecha), las completions de ayer
dejan de contar y el score arranca de cero automáticamente, sin perder
historial.

## Ventana de gracia de 2 h y `covered_due_at`

Las tareas diarias con horarios (`due_times`) tienen una **ventana de gracia de
2 horas** después de cada vencimiento para poder cubrirlo:

- Si una tarea vence a las **09:00**, la ventana válida para cubrir esa
  ocurrencia va de 09:00 a **11:00**.
- Completar a las 09:30 cubre la ocurrencia de 09:00 y el siguiente vencimiento
  visible pasa a ser 18:00.
- Completar a las 11:30 (ya pasada la gracia de 09:00) **no** cuenta para 09:00:
  esa ocurrencia queda perdida para el score y la completion cubre la siguiente
  ocurrencia pendiente (18:00).

Al completar, se guarda en `task_completions.covered_due_at` **qué ocurrencia**
cubre esa completion. La lógica pura vive en `src/lib/schedule.ts`:

- `computeCoveredDueAt(task, completions, now)` calcula la ocurrencia a cubrir:
  la vencida sin cubrir más antigua con la gracia aún abierta
  (`dueAt <= now <= dueAt + 2h`), o si no, la siguiente ocurrencia futura (hoy o
  el próximo día activo). Devuelve `null` para `every_n_days` o cuando no se
  puede calcular (completion legacy).
- `buildDailyOccurrences(...)` genera las ocurrencias y marca cuáles quedaron
  cubiertas, considerando `covered_due_at` explícito y, para completions
  antiguas sin ese campo, un emparejamiento compatible por `completed_at`.

El **score diario** usa esto: una ocurrencia del día cuenta como completada si
está cubierta; si su gracia expiró sin cubrirse, cuenta en el total pero no en
las completadas (ocurrencia perdida). Una completion cuenta para el día de
`covered_due_at` si existe; si es `null`, se usa `completed_at` (legacy). Una
misma completion cubre a lo sumo una ocurrencia, así que nunca se cuenta de más.

## Mi tablero (`/mi-tablero`)

Tablero del **perfil activo**: muestra sólo sus tareas (`enabled = true` y
`assigned_to` = perfil activo), en **orden cronológico** — las vencidas primero,
luego por próximo vencimiento, y las que no tienen vencimiento al final. Cada
tarjeta muestra título, zona, estado (Bien/Próxima/Urgente/Vencida), próximo
vencimiento o "Vencida desde", los horarios configurados y un botón
**Completar** (que usa la misma lógica de `covered_due_at`). Si el perfil no
tiene tareas asignadas, se muestra "No tienes tareas asignadas por ahora". Si no
hay perfil activo, redirige a `/login`.

## Búsqueda y ordenamiento en `/tareas`

El panel de administración tiene una **barra de búsqueda** (filtra en cliente
por título, zona, responsable y tipo de recurrencia) y un **select de orden**:

- **Cronológico** (por próximo vencimiento; vencidas primero, sin vencimiento al
  final), **A-Z**, **Z-A**, **Zona**, **Responsable**, **Activas primero**,
  **Inactivas primero**.

Se muestra un conteo "Mostrando X de Y tareas" y un botón **Limpiar** que
resetea búsqueda y orden. Crear/editar/desactivar/reactivar siguen funcionando
igual.

## Mapa de la casa (3 pisos)

El mapa (`/`) tiene un selector para cambiar entre tres vistas — **Planta
baja**, **1er piso** y **2do piso** —, cada una con su propio plano tipo
casa (grid con áreas nombradas). La configuración de qué zonas pertenecen a cada piso y en qué
orden vive en `src/lib/floorPlans.ts`; el layout visual (quién es grande,
quién va arriba/abajo) vive en `globals.css` (clases `.zone-map--planta-baja`,
`.zone-map--piso-1`, `.zone-map--piso-2`).

- **Planta baja** reutiliza las zonas que ya existían: `patio-trasero`,
  `bano`, `estudio`, `garaje`, `cocina`, `comedor`, `sala`, `jardin`. Se le
  agregó `escaleras-pb` ("Escaleras (PB)").
- **1er piso** reutiliza `pasillo` como su franja central, y agrega
  `bano-p1`, `escaleras-p1`, `librero`, `cuarto-papas`, `cuarto-carlitos`,
  `cuarto-paulina`, `terraza`. Tiene **dos escaleras distintas**:
  `escaleras-p1` (principal, junto a Librero) y `escaleras-p1-servicio`
  (secundaria, junto a Cuarto Carlitos) — no son la misma zona duplicada,
  son dos tramos de escalera físicamente distintos.
- **2do piso** es enteramente nuevo: `cuarto-servicio`, `bano-p2`, `azotea`,
  `escaleras-p2`.
- La zona genérica `cuarto` (del seed original) **ya no aparece en ningún
  plano** — no encajaba con el nuevo layout de pisos. No se borró (por si
  tiene tareas o historial asociado); simplemente no está en la lista de
  ninguno de los `FLOOR_PLANS`. Sigue siendo utilizable desde `/tareas` si
  hace falta, solo que no se ve en el mapa.

Si agregas una zona nueva directamente en Supabase sin agregarla también a
`src/lib/floorPlans.ts`, aparecerá en `/tareas` y `/historial` pero no en
ningún plano del mapa — es una limitación conocida, no un bug.

### Mapa fijo con zoom

El mapa **mantiene la misma distribución en móvil y en desktop** (no cambia a
lista ni a otra cuadrícula en pantallas chicas). Para adaptarse a pantallas
pequeñas, el mapa vive dentro de un contenedor con scroll propio
(`.zone-map-viewport`) y tiene controles de **zoom** (−, porcentaje, +, y
reset a 100%). El zoom afecta únicamente al mapa (no al header ni al resto de
la app) y el desplazamiento queda contenido en su contenedor, sin generar
overflow horizontal en toda la página. Las zonas siguen siendo clickeables y
conservan sus colores/etiquetas de urgencia a cualquier nivel de zoom.

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

   Si ya tenías una base creada con una versión anterior de `schema.sql`, en
   vez de recrear las tablas corre los patches en `sql/` que apliquen a tu
   caso:

   - `patch-assign-initial-responsibles.sql` — asigna responsables
     (`carlitos`, `paulina`, `papa-angel`) a las 3 tareas semilla del
     Comedor, si tu base las tiene con `assigned_to = null`.
   - `patch-task-template-write-policies.sql` — habilita insert/update de
     `task_templates` para que `/tareas` pueda crear y editar (ver sección
     "Panel de administración de tareas" más abajo).
   - `patch-add-floor-zones.sql` — agrega las zonas de 1er y 2do piso (y
     "Escaleras (PB)" de planta baja) que usa el selector de pisos del mapa
     (ver sección "Mapa de la casa" más arriba). Solo hace `insert ... on
     conflict do update`, no borra zonas existentes.
   - `patch-add-escaleras-servicio-piso1.sql` — agrega la escalera
     secundaria/de servicio del 1er piso (junto a Cuarto Carlitos), aparte
     de la escalera principal (`escaleras-p1`, junto a Librero).
   - `patch-task-due-times.sql` — **necesario para la versión con horarios
     múltiples**. Agrega `due_times text[]` y `created_at timestamptz` a
     `task_templates` y migra los datos actuales (`due_times = array[due_time]`).
     La app espera estas columnas; si no corres este patch en una base
     existente, la carga del mapa/tareas fallará. Es idempotente.
   - `patch-completion-covered-due-at.sql` — **necesario para la ventana de
     gracia de 2 h**. Agrega `covered_due_at timestamptz` a `task_completions`
     (más un índice). La app inserta este campo al completar; si no corres el
     patch en una base existente, completar tareas fallará. Es idempotente y no
     borra datos.

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
| `FAMILY_PIN`                     | PIN familiar que protege el acceso a la app (ver abajo) |

Las dos primeras son públicas (`NEXT_PUBLIC_*`) porque la app corre
enteramente en el cliente contra la API de Supabase, protegida por las
políticas de RLS definidas en `sql/schema.sql`. `FAMILY_PIN` es **privada a
propósito** (sin prefijo `NEXT_PUBLIC_`): solo la leen `middleware.ts` y los
route handlers en `src/app/api/pin/*`, que corren en el servidor — nunca
llega al bundle del cliente.

## PIN familiar (bloqueo de acceso)

Para que alguien que abra la URL sin conocer el PIN no vea nada de la app,
`middleware.ts` protege todas las rutas excepto `/pin` y
`/api/pin/login`/`logout`. Si no hay una cookie válida, redirige a `/pin`.

- **No es autenticación real de Supabase**: es un candado de interfaz a
  nivel de toda la app, pensado solo para que un visitante casual con la URL
  no entre sin el PIN. Cualquiera que sepa el PIN sigue entrando como
  cualquier perfil (el login simbólico no cambia). Las políticas de RLS de
  Supabase siguen siendo las mismas de siempre.
- Al enviar el PIN correcto, `POST /api/pin/login` guarda una cookie
  `HttpOnly`, `SameSite=Lax` (y `Secure` en producción) con un HMAC del PIN
  (no el PIN en texto plano, para que no quede legible ni en las devtools
  del navegador). `middleware.ts` recalcula ese mismo HMAC en cada request
  para validar la cookie.
- El botón "Salir" del header llama a `POST /api/pin/logout` (borra la
  cookie) y regresa a `/pin`. Es independiente de "Cambiar" (que solo
  cambia el perfil activo, sin afectar el PIN).
- Si `FAMILY_PIN` no está configurada, el middleware deja pasar todo sin
  pedir PIN (para no bloquear un deploy mal configurado por accidente) —
  configúrala siempre en producción.

## Rutas principales

| Ruta          | Qué hace                                                        |
| ------------- | ---------------------------------------------------------------- |
| `/pin`        | Candado de PIN familiar; sin cookie válida, todo lo demás redirige aquí |
| `/login`      | Selección de perfil simbólico (Papá Angel, Mamá Lau, Paulina, Carlitos) |
| `/`           | Mapa de la casa por zonas, con modal de tareas por zona           |
| `/mi-tablero` | Tareas del perfil activo, en orden cronológico, con botón Completar |
| `/score`      | Score diario (casa y por persona) en barras de progreso de colores |
| `/tareas`     | Crear, editar, desactivar y reactivar tareas; con búsqueda y orden |
| `/historial`  | Últimas 50 tareas completadas, con filtros por persona y zona     |

## Deploy en Vercel

1. Subir el repositorio a GitHub (u otro proveedor soportado por Vercel).
2. En Vercel, "Add New Project" → importar el repositorio.
3. En **Environment Variables**, agregar `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `FAMILY_PIN` con los mismos valores que
   en `.env.local` (a `FAMILY_PIN` **no** le pongas el prefijo `NEXT_PUBLIC_`).
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
