-- Corrige activar_membresia_primera_reserva():
-- un plan ilimitado que vence ANTES de la fecha de la clase ya no se queda con la reserva;
-- entra el siguiente plan (en espera / en fila). Antes solo se comparaba contra "hoy" (día de reservar).
-- Único cambio respecto a la versión actual: variable fecha_clase y la comparación m.fecha_fin < fecha_clase.

CREATE OR REPLACE FUNCTION public.activar_membresia_primera_reserva()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  hoy DATE := (now() AT TIME ZONE 'America/Mexico_City')::date;
  fecha_clase DATE;
  m RECORD; c RECORD; e_id UUID; e_estatus TEXT; e_pendiente BOOLEAN; e_por_clases BOOLEAN; e_vig INTEGER;
  hay_clases BOOLEAN := false;
BEGIN
  IF NEW.cliente_id IS NULL OR COALESCE(NEW.estatus, '') IN ('Cancelada', 'Cancelado') THEN RETURN NEW; END IF;
  IF COALESCE(NEW.origen, '') ILIKE ANY (ARRAY['%wellhub%', '%totalpass%']) THEN RETURN NEW; END IF;

  -- Día de la clase (hora CDMX); nunca antes de hoy
  SELECT (horario AT TIME ZONE 'America/Mexico_City')::date INTO fecha_clase FROM clases WHERE id = NEW.clase_id;
  fecha_clase := GREATEST(COALESCE(fecha_clase, hoy), hoy);

  -- Orden: el que mandó la app (si sirve), luego el activo, luego la fila (el más antiguo primero)
  FOR m IN SELECT mb.*, p.vigencia_dias, p.clases_incluidas
           FROM membresias mb JOIN paquetes p ON p.id = mb.paquete_id
           WHERE mb.cliente_id = NEW.cliente_id AND mb.estatus IN ('Activa', 'En fila')
           ORDER BY (mb.id = NEW.membresia_id) DESC NULLS LAST, (mb.estatus = 'Activa') DESC, mb.created_at
  LOOP
    SELECT * INTO c FROM clases_del_plan(m.id);
    IF c.total IS NOT NULL THEN
      hay_clases := true;
      IF c.usadas >= c.total THEN CONTINUE; END IF;   -- ya no le quedan clases
    ELSIF m.estatus = 'Activa' AND NOT coalesce(m.activacion_pendiente, false)
          AND m.fecha_fin IS NOT NULL AND m.fecha_fin < fecha_clase THEN
      CONTINUE;                                        -- vence antes de la clase: le toca el siguiente plan
    END IF;
    e_id := m.id; e_estatus := m.estatus; e_pendiente := coalesce(m.activacion_pendiente, false);
    e_por_clases := c.total IS NOT NULL; e_vig := coalesce(m.vigencia_dias, 30);
    EXIT;
  END LOOP;

  IF e_id IS NULL THEN
    IF hay_clases AND coalesce(NEW.origen, 'App') = 'App' THEN
      RAISE EXCEPTION 'SIN_CLASES: ya usaste todas las clases de tu paquete';
    END IF;
    RETURN NEW;   -- sin plan: lo valida la app / recepción (cortesías, etc.)
  END IF;

  -- Si estaba pendiente o en la fila, empieza a correr hoy
  IF e_estatus = 'En fila' OR e_pendiente THEN
    UPDATE membresias SET estatus = 'Activa', activacion_pendiente = false, activada_at = now(),
      fecha_inicio = hoy,
      fecha_fin = CASE WHEN e_por_clases THEN NULL ELSE hoy + e_vig END,
      stripe_sincronizada = (stripe_subscription_id IS NULL)
    WHERE id = e_id;
    UPDATE clientes SET fecha_venc_plan = (SELECT max(fecha_fin) FROM membresias WHERE cliente_id = NEW.cliente_id AND estatus = 'Activa')
    WHERE id = NEW.cliente_id;
    -- Empieza un plan nuevo: su sucursal principal pasa a la del plan, y se cancelan sus reservas donde ya no tendrá acceso
    PERFORM aplicar_cambio_sucursal(e_id, NEW.clase_id);
  END IF;

  NEW.membresia_id := e_id;
  RETURN NEW;
END $function$;
