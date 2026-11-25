-- The Galley: merma con cortesía autorizada + conteo físico semanal.
-- Córrelo completo en el SQL Editor de Supabase (se ejecuta como una sola transacción: si algo falla, no queda nada a medias).
-- Para deshacerlo todo, al final del archivo están las instrucciones de reversa.

-- 1) Merma: quién autorizó una cortesía, para quién fue y quién la registró
alter table merma add column if not exists autorizado_por uuid references staff(id);
alter table merma add column if not exists detalle        text;
alter table merma add column if not exists registrado_por uuid references staff(id);

-- 2) Ayudas para los permisos (las usan las reglas de las tablas nuevas)
create or replace function public.es_direccion() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff where supabase_user_id = auth.uid() and rol = 'direccion' and estatus = 'Activo')
$$;

create or replace function public.tiene_sucursal(p_sucursal uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.es_direccion() or exists (
    select 1 from staff s
    where s.supabase_user_id = auth.uid() and s.estatus = 'Activo'
      and (s.sucursal_asignada_id = p_sucursal
           or exists (select 1 from staff_sucursales ss where ss.staff_id = s.id and ss.sucursal_id = p_sucursal)))
$$;

-- 3) Conteo físico semanal
create table if not exists conteos_inventario (
  id              uuid primary key default gen_random_uuid(),
  sucursal_id     uuid not null references sucursales(id),
  semana          date not null,                 -- jueves que abre el ciclo semanal
  realizado_por   uuid references staff(id),
  total_insumos   int  not null default 0,
  con_diferencia  int  not null default 0,
  ajuste_aplicado boolean not null default false,
  notas           text,
  created_at      timestamptz not null default now()
);
create index if not exists conteos_inventario_sucursal_idx on conteos_inventario (sucursal_id, semana desc);

create table if not exists conteo_inventario_items (
  id            uuid primary key default gen_random_uuid(),
  conteo_id     uuid not null references conteos_inventario(id) on delete cascade,
  insumo_id     uuid not null references insumos(id),
  stock_sistema numeric not null,
  stock_contado numeric not null,
  diferencia    numeric not null
);
create index if not exists conteo_items_conteo_idx on conteo_inventario_items (conteo_id);

-- 4) Permisos de las tablas nuevas: solo el personal de esa sucursal y Dirección
alter table conteos_inventario      enable row level security;
alter table conteo_inventario_items enable row level security;

create policy "conteos: su sucursal o direccion" on conteos_inventario
  for all to authenticated
  using (public.tiene_sucursal(sucursal_id)) with check (public.tiene_sucursal(sucursal_id));

create policy "conteo items: de un conteo de su sucursal" on conteo_inventario_items
  for all to authenticated
  using (exists (select 1 from conteos_inventario c where c.id = conteo_id and public.tiene_sucursal(c.sucursal_id)))
  with check (exists (select 1 from conteos_inventario c where c.id = conteo_id and public.tiene_sucursal(c.sucursal_id)));

-- REVERSA (solo si hay que deshacer; descomenta y corre):
-- drop table if exists conteo_inventario_items;
-- drop table if exists conteos_inventario;
-- drop function if exists public.tiene_sucursal(uuid);
-- drop function if exists public.es_direccion();
-- alter table merma drop column if exists autorizado_por, drop column if exists detalle, drop column if exists registrado_por;
