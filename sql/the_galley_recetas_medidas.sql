-- The Galley: recetas con medidas libres (cucharadas, tazas, scoops…).
-- La cantidad que descuenta el inventario sigue guardándose en la unidad base del insumo (g, ml, pza…);
-- aquí se agrega lo que la persona escribió y una tabla de equivalencias por insumo (1 cucharada de X = N g).
-- Córrelo completo en el SQL Editor de Supabase (una sola transacción).

-- 1) Lo que se escribió en la receta, para mostrarlo tal cual
alter table receta_ingredientes add column if not exists cantidad_medida numeric;
alter table receta_ingredientes add column if not exists unidad_medida   text;

-- 2) Equivalencias por insumo: cuánto vale 1 medida en la unidad base del insumo
create table if not exists insumo_equivalencias (
  id            uuid primary key default gen_random_uuid(),
  insumo_id     uuid not null references insumos(id) on delete cascade,
  unidad        text not null,                         -- medida normalizada: minúsculas y sin plural ("cucharada", "taza")
  cantidad_base numeric not null check (cantidad_base > 0),
  created_at    timestamptz not null default now(),
  unique (insumo_id, unidad)
);

-- 3) Permisos: todo el staff autenticado las ve; Dirección, Gerente y Staff Galley las editan
create or replace function public.es_staff_galley() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff
                 where supabase_user_id = auth.uid() and estatus = 'Activo'
                   and rol in ('direccion', 'gerente', 'staff_galley'))
$$;

alter table insumo_equivalencias enable row level security;
create policy "equivalencias: ver" on insumo_equivalencias for select to authenticated using (true);
create policy "equivalencias: editar" on insumo_equivalencias for all to authenticated
  using (public.es_staff_galley()) with check (public.es_staff_galley());

-- REVERSA (descomenta y corre solo si hay que deshacer):
-- drop table if exists insumo_equivalencias;
-- drop function if exists public.es_staff_galley();
-- alter table receta_ingredientes drop column if exists cantidad_medida, drop column if exists unidad_medida;
