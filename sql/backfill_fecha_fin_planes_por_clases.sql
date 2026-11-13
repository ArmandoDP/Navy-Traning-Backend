-- Planes por clases ya activados que quedaron con fecha_fin NULL: ponerles fecha_inicio + vigencia_dias.
-- OJO: avanzar_planes (cada hora) vence por fecha, así que los que ya pasaron su vigencia se cerrarán solos.

-- 1) VISTA PREVIA (no cambia nada). Revisa la columna "vencera_ya" antes de correr el UPDATE.
select c.email, p.nombre, m.fecha_inicio, p.vigencia_dias,
       m.fecha_inicio + coalesce(p.vigencia_dias, 30) as nueva_fecha_fin,
       (m.fecha_inicio + coalesce(p.vigencia_dias, 30)) < (now() at time zone 'America/Mexico_City')::date as vencera_ya
from membresias m
join paquetes p on p.id = m.paquete_id
join clientes c on c.id = m.cliente_id
where m.estatus = 'Activa' and m.fecha_fin is null and not coalesce(m.activacion_pendiente, false)
  and p.clases_incluidas is not null
order by vencera_ya desc, nueva_fecha_fin;

-- 2) OPCIÓN A: corregir solo los que todavía están dentro de su vigencia (no vence nadie de golpe)
update membresias m set fecha_fin = m.fecha_inicio + coalesce(p.vigencia_dias, 30)
from paquetes p
where p.id = m.paquete_id and m.estatus = 'Activa' and m.fecha_fin is null
  and not coalesce(m.activacion_pendiente, false) and p.clases_incluidas is not null
  and m.fecha_inicio + coalesce(p.vigencia_dias, 30) >= (now() at time zone 'America/Mexico_City')::date;

-- 2) OPCIÓN B (en lugar de la A): corregir a todos; los ya pasados se vencerán en la siguiente corrida horaria
-- update membresias m set fecha_fin = m.fecha_inicio + coalesce(p.vigencia_dias, 30)
-- from paquetes p
-- where p.id = m.paquete_id and m.estatus = 'Activa' and m.fecha_fin is null
--   and not coalesce(m.activacion_pendiente, false) and p.clases_incluidas is not null;

-- 3) La fecha de vencimiento de la ficha (clientes.fecha_venc_plan) la recalcula solo el backend en la siguiente
--    corrida horaria (minuto :05); no hace falta tocarla aquí.
