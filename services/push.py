import os
import httpx
from datetime import datetime, timedelta, timezone
from services.supabase import supabase

EXPO_TOKEN = os.getenv("EXPO_ACCESS_TOKEN")

async def enviar_push(tokens: list[str], titulo: str, cuerpo: str, data: dict = {}):
  if not tokens:
    return

  messages = [
    {
      "to":    token,
      "title": titulo,
      "body":  cuerpo,
      "data":  data,
    }
    for token in tokens
  ]

  # Mandar en chunks de 100
  async with httpx.AsyncClient() as client:
    for i in range(0, len(messages), 100):
      chunk = messages[i:i+100]
      await client.post(
        "https://exp.host/--/api/v2/push/send",
        json=chunk,
        headers={
          "Authorization": f"Bearer {EXPO_TOKEN}",
          "Content-Type":  "application/json",
        }
      )

async def check_recordatorios_clase():
  """Corre cada hora — manda push 1 día antes y 1 hora antes de cada clase"""
  ahora     = datetime.now(timezone.utc)
  en_1h     = ahora + timedelta(hours=1, minutes=5)
  en_1h_min = ahora + timedelta(hours=0, minutes=55)
  en_24h    = ahora + timedelta(hours=24, minutes=5)
  en_24h_min= ahora + timedelta(hours=23, minutes=55)

  # Verificar si la alerta está activa
  config_1h  = supabase.table("alertas_config").select("activa").eq("tipo", "recordatorio_clase_1h").single().execute()
  config_1d  = supabase.table("alertas_config").select("activa").eq("tipo", "recordatorio_clase_1d").single().execute()

  # Reservas en ~1 hora
  if config_1h.data and config_1h.data["activa"]:
    reservas = supabase.table("reservas")\
      .select("*, clientes(nombre_completo, push_tokens(token)), clases(nombre_clase, horario, sucursales(nombre))")\
      .eq("estatus", "Confirmada")\
      .gte("clases.horario", en_1h_min.isoformat())\
      .lte("clases.horario", en_1h.isoformat())\
      .execute()

    for r in (reservas.data or []):
      if not r.get("clases"):  # ← agrega esto
        continue
      tokens = [pt["token"] for pt in (r["clientes"].get("push_tokens") or [])]
      nombre_clase = r["clases"]["nombre_clase"]
      sucursal     = r["clases"]["sucursales"]["nombre"]
      hora         = datetime.fromisoformat(r["clases"]["horario"]).strftime("%I:%M %p")

      await enviar_push(
        tokens,
        titulo=f"⏰ Tu clase empieza en 1 hora",
        cuerpo=f"{nombre_clase} a las {hora} en {sucursal}. ¡Prepárate!",
        data={ "tipo": "recordatorio_clase", "reserva_id": r["id"] }
      )

  # Reservas en ~24 horas
  if config_1d.data and config_1d.data["activa"]:
    reservas = supabase.table("reservas")\
      .select("*, clientes(nombre_completo, push_tokens(token)), clases(nombre_clase, horario, sucursales(nombre))")\
      .eq("estatus", "Confirmada")\
      .gte("clases.horario", en_24h_min.isoformat())\
      .lte("clases.horario", en_24h.isoformat())\
      .execute()

    for r in (reservas.data or []):
      if not r.get("clases"):  # ← agrega esto
        continue
      tokens = [pt["token"] for pt in (r["clientes"].get("push_tokens") or [])]
      nombre_clase = r["clases"]["nombre_clase"]
      sucursal     = r["clases"]["sucursales"]["nombre"]
      hora         = datetime.fromisoformat(r["clases"]["horario"]).strftime("%I:%M %p")

      await enviar_push(
        tokens,
        titulo=f"📅 Recordatorio — mañana tienes clase",
        cuerpo=f"{nombre_clase} a las {hora} en {sucursal}. ¡Te esperamos!",
        data={ "tipo": "recordatorio_clase", "reserva_id": r["id"] }
      )

async def check_clases_en_curso():
  ahora = datetime.now(timezone.utc)
  
  # Traer clases activas
  clases_res = supabase.table("clases")\
    .select("id, horario, duracion_minutos")\
    .eq("estado", "Activa")\
    .execute()

  for clase in (clases_res.data or []):
    horario  = datetime.fromisoformat(clase["horario"])
    duracion = clase.get("duracion_minutos", 60)
    fin      = horario + timedelta(minutes=duracion)

    if horario <= ahora <= fin:
      supabase.table("clases").update({ "estado_actual": "En curso" })\
        .eq("id", clase["id"]).execute()
    elif ahora > fin:
      supabase.table("clases").update({ "estado_actual": "Finalizada" })\
        .eq("id", clase["id"]).execute()
      
async def check_membresias_por_vencer():
  """Corre diario a las 8am CST — manda push y correo a clientes con membresía por vencer"""
  hoy = datetime.now(timezone.utc).date()

  for dias in [7, 3, 1]:
    config = supabase.table("alertas_config").select("activa, canales")\
      .eq("tipo", f"membresia_vence_{dias}d").single().execute()

    if not config.data or not config.data["activa"]:
      continue

    fecha_vence = hoy + timedelta(days=dias)

    membresias = supabase.table("membresias")\
      .select("*, renovacion_cancelada, clientes(nombre_completo, email, push_tokens(token)), paquetes(nombre)")\
      .eq("estatus", "Activa")\
      .eq("fecha_fin", fecha_vence.isoformat())\
      .execute()

    for m in (membresias.data or []):
      cliente      = m["clientes"]
      paquete      = m["paquetes"]["nombre"]
      tokens       = [pt["token"] for pt in (cliente.get("push_tokens") or [])]
      nombre       = cliente["nombre_completo"].split()[0]

      if "push" in config.data["canales"]:
        await enviar_push(
          tokens,
          titulo=f"⚠️ Tu membresía vence en {dias} día{'s' if dias > 1 else ''}",
          cuerpo=f"Hola {nombre}, tu plan {paquete} vence pronto. ¡Renuévalo para seguir entrenando!",
          data={ "tipo": "membresia_vence", "membresia_id": m["id"] }
        )

async def check_no_shows():
  """Corre cada hora — detecta clases terminadas con reservas sin check-in"""
  from datetime import datetime, timezone, timedelta
  
  ahora = datetime.now(timezone.utc)
  hace1h = ahora - timedelta(hours=1)
  hace2h = ahora - timedelta(hours=4)

  print(f"Buscando clases entre {hace2h} y {hace1h}")

  # Clases que terminaron en la última hora
  clases_res = supabase.table("clases")\
    .select("id, nombre_clase, duracion_minutos, horario, sucursal_id")\
    .eq("estado", "Activa")\
    .lte("horario", hace1h.isoformat())\
    .gte("horario", hace2h.isoformat())\
    .execute()

  print(f"Clases encontradas: {len(clases_res.data or [])}")
  print(clases_res.data)

  for clase in (clases_res.data or []):
    print(f"Procesando clase: {clase['nombre_clase']}")
    # Reservas confirmadas de esa clase
    reservas_res = supabase.table("reservas")\
      .select("id, cliente_id, clientes(paquete_id, paquetes(penalizacion_noshow, monto_penalizacion))")\
      .eq("clase_id", clase["id"])\
      .eq("estatus", "Confirmada")\
      .execute()

    print(f"Reservas encontradas: {len(reservas_res.data or [])}")
    print(reservas_res.data)

    for reserva in (reservas_res.data or []):
      cliente_id = reserva["cliente_id"]
      paquete    = reserva["clientes"]["paquetes"]

      if not paquete or not paquete.get("penalizacion_noshow"):
        continue

      # Verificar si hizo check-in
      checkin_res = supabase.table("asistencias")\
        .select("id")\
        .eq("cliente_id", cliente_id)\
        .eq("clase_id", clase["id"])\
        .maybe_single().execute()

      if checkin_res and checkin_res.data:
        continue  # Sí hizo check-in, no hay No Show

      # Verificar si ya tiene penalización para esta reserva
      ya_penalizado = supabase.table("penalizaciones_noshow")\
        .select("id")\
        .eq("reserva_id", reserva["id"])\
        .maybe_single().execute()

      if ya_penalizado and ya_penalizado.data:
        continue # Ya fue penalizado

      monto = paquete.get("monto_penalizacion", 150)

      # Crear penalización
      supabase.table("penalizaciones_noshow").insert({
        "cliente_id": cliente_id,
        "reserva_id": reserva["id"],
        "clase_id":   clase["id"],
        "monto":      monto,
        "estatus":    "Pendiente",
      }).execute()

      # Marcar reserva como No Show
      supabase.table("reservas").update({ "estatus": "No Show" })\
        .eq("id", reserva["id"]).execute()

      # Push al cliente
      tokens_res = supabase.table("push_tokens")\
        .select("token").eq("cliente_id", cliente_id).execute()
      tokens = [t["token"] for t in (tokens_res.data or [])]


      
      await enviar_push(
        tokens,
        titulo="⚠️ No Show registrado",
        cuerpo=f"No te presentaste a {clase['nombre_clase']}. Tienes un cargo pendiente de ${monto} MXN.",
        data={ "tipo": "no_show", "monto": monto }
      )

    # Al final del loop — marcar clase como Finalizada
    supabase.table("clases").update({ "estado_actual": "Finalizada" })\
      .eq("id", clase["id"]).execute()
    print(f"Clase {clase['nombre_clase']} marcada como Finalizada")

async def renovar_membresias_recurrentes():
  from datetime import date, timedelta
  from services.orkestapay import cobrar_tarjeta_guardada
  import uuid

  hoy = date.today()
  en_3_dias = hoy + timedelta(days=3)

  # Buscar membresías recurrentes que vencen en 3 días
  res = supabase.table("membresias")\
    .select("*, clientes(id, nombre_completo, email, sucursal_id, orkestapay_customer_id), paquetes(nombre, precio, vigencia_dias, es_recurrente)")\
    .eq("estatus", "Activa")\
    .lte("fecha_fin", en_3_dias.isoformat())\
    .gte("fecha_fin", hoy.isoformat())\
    .execute()

  for memb in (res.data or []):
    cliente  = memb.get("clientes", {})
    paquete  = memb.get("paquetes", {})

    # Solo renovar si el paquete es recurrente
    if not paquete.get("es_recurrente"):
      continue

    customer_id = cliente.get("orkestapay_customer_id")
    sucursal_id = cliente.get("sucursal_id")
    cliente_id  = cliente.get("id")

    if not customer_id or not sucursal_id:
      print(f"Sin customer_id o sucursal_id para cliente {cliente_id}")
      continue

    # Obtener método de pago guardado
    try:
      from services.orkestapay import listar_metodos_pago
      metodos = await listar_metodos_pago(sucursal_id, customer_id)
      content = metodos.get("content", [])
      if not content:
        print(f"Sin tarjeta guardada para cliente {cliente_id}")
        continue

      payment_method_id = content[0].get("payment_method_id")
      monto             = memb.get("precio_pagado", paquete.get("precio", 0))
      idempotency_key   = str(uuid.uuid4()).replace("-", "")

      resultado = await cobrar_tarjeta_guardada(
        sucursal_id       = sucursal_id,
        customer_id       = customer_id,
        payment_method_id = payment_method_id,
        monto             = monto,
        concepto          = f"Renovación {paquete.get('nombre')}",
        idempotency_key   = idempotency_key,
      )

      # Crear nueva membresía
      nueva_inicio = memb["fecha_fin"]
      nueva_fin    = (date.fromisoformat(memb["fecha_fin"]) + timedelta(days=paquete.get("vigencia_dias", 30))).isoformat()

      supabase.table("membresias").update({ "estatus": "Inactiva" }).eq("id", memb["id"]).execute()
      supabase.table("membresias").insert({
        "cliente_id":    cliente_id,
        "paquete_id":    memb["paquete_id"],
        "fecha_inicio":  nueva_inicio,
        "fecha_fin":     nueva_fin,
        "estatus":       "Activa",
        "precio_pagado": monto,
        "origen":        "Renovacion",
      }).execute()

      # Registrar pago
      supabase.table("pagos").insert({
        "cliente_id":  cliente_id,
        "monto":       monto,
        "estatus":     "Completado",
        "metodo_pago": "Tarjeta",
        "canal":       "Navy",
        "concepto":    f"Renovación automática — {paquete.get('nombre')}",
        "fecha_pago":  hoy.isoformat(),
        "sucursal_id": sucursal_id,
      }).execute()

      # Actualizar fecha_venc_plan en cliente
      supabase.table("clientes").update({ "fecha_venc_plan": nueva_fin }).eq("id", cliente_id).execute()

      print(f"✅ Renovada membresía de {cliente.get('email')} hasta {nueva_fin}")

    except Exception as e:
      print(f"❌ Error renovando membresía de {cliente_id}: {e}")

      # Crear alerta de pago fallido
      supabase.table("alertas").insert({
        "tipo":        "pago_fallido",
        "categoria":   "operacion",
        "titulo":      f"Renovación fallida — {cliente.get('nombre_completo')}",
        "descripcion": str(e),
        "cliente_id":  cliente_id,
      }).execute()

async def check_renovaciones_recurrentes():
  """Corre diario a las 8am — intenta cobrar membresías recurrentes próximas a vencer"""
  from datetime import date, timedelta
  from services.orkestapay import cobrar_tarjeta_guardada, listar_metodos_pago
  import uuid

  hoy      = date.today()
  RESEND_KEY = os.getenv("RESEND_API_KEY")

  async def enviar_correo(email: str, nombre: str, subject: str, mensaje: str):
    async with httpx.AsyncClient() as client:
      await client.post('https://api.resend.com/emails',
        headers={'Authorization': f'Bearer {RESEND_KEY}', 'Content-Type': 'application/json'},
        json={
          'from':    'Navy Training Center <noreply@navytrainingcenter.com>',
          'to':      email,
          'subject': subject,
          'html':    f'''<div style="font-family:sans-serif;max-width:560px;margin:40px auto">
            <div style="background:#171B24;border-radius:20px 20px 0 0;padding:32px;text-align:center">
              <p style="color:#fff;font-size:28px;font-weight:900;margin:0;letter-spacing:4px">NAVY</p>
            </div>
            <div style="background:#fff;padding:32px;border:1px solid #e5e7eb">
              <h2 style="color:#111">Hola {nombre} 👋</h2>
              <p style="color:#6b7280;font-size:15px;line-height:24px">{mensaje}</p>
            </div>
          </div>'''
        })

  for dias in [7, 3, 1]:
    fecha_vence = hoy + timedelta(days=dias)

    membresias = supabase.table("membresias")\
      .select("*, renovacion_cancelada, clientes(id, nombre_completo, email, sucursal_id, orkestapay_customer_id, push_tokens(token)), paquetes(id, nombre, precio, vigencia_dias, es_recurrente, penalizacion_noshow)")\
      .eq("estatus", "Activa")\
      .eq("fecha_fin", fecha_vence.isoformat())\
      .execute()

    for m in (membresias.data or []):
      cliente  = m.get("clientes", {})
      paquete  = m.get("paquetes", {})
      nombre   = (cliente.get("nombre_completo") or "").split()[0]
      email    = cliente.get("email")
      tokens   = [pt["token"] for pt in (cliente.get("push_tokens") or [])]
      es_recurrente = paquete.get("es_recurrente", False)

      # ← agrega esto
      if m.get("renovacion_cancelada"):
        print(f"Renovación cancelada para {email}, skipping")
        continue

      if es_recurrente:
        # Intentar cobro automático
        customer_id = cliente.get("orkestapay_customer_id")
        sucursal_id = cliente.get("sucursal_id")
        cliente_id  = cliente.get("id")

        cobrado = False
        if customer_id and sucursal_id:
          try:
            metodos = await listar_metodos_pago(sucursal_id, customer_id)
            content = metodos.get("content", [])
            if content:
              payment_method_id = content[0].get("payment_method_id")
              monto = m.get("precio_pagado", paquete.get("precio", 0))

              resultado = await cobrar_tarjeta_guardada(
                sucursal_id       = sucursal_id,
                customer_id       = customer_id,
                payment_method_id = payment_method_id,
                monto             = monto,
                concepto          = f"Renovación {paquete.get('nombre')}",
                idempotency_key   = str(uuid.uuid4()).replace("-", ""),
              )

              # Crear nueva membresía
              nueva_fin = (date.fromisoformat(m["fecha_fin"]) + timedelta(days=paquete.get("vigencia_dias", 30))).isoformat()
              supabase.table("membresias").update({ "estatus": "Inactiva" }).eq("id", m["id"]).execute()
              supabase.table("membresias").insert({
                "cliente_id":    cliente_id,
                "paquete_id":    m["paquete_id"],
                "fecha_inicio":  m["fecha_fin"],
                "fecha_fin":     nueva_fin,
                "estatus":       "Activa",
                "precio_pagado": monto,
                "origen":        "Renovacion",
              }).execute()
              supabase.table("clientes").update({ "fecha_venc_plan": nueva_fin }).eq("id", cliente_id).execute()
              supabase.table("pagos").insert({
                "cliente_id":  cliente_id,
                "monto":       monto,
                "estatus":     "Completado",
                "metodo_pago": "Tarjeta",
                "canal":       "Navy",
                "concepto":    f"Renovación automática — {paquete.get('nombre')}",
                "fecha_pago":  hoy.isoformat(),
                "sucursal_id": sucursal_id,
              }).execute()

              cobrado = True
              print(f"✅ Renovada membresía de {email}")

              # Push y correo de renovación exitosa
              await enviar_push(tokens,
                titulo="✅ Membresía renovada",
                cuerpo=f"Tu plan {paquete.get('nombre')} se renovó automáticamente. ¡Sigue entrenando!",
                data={"tipo": "renovacion_exitosa"})
              await enviar_correo(email, nombre,
                "Tu membresía Navy se renovó automáticamente 🎉",
                f"Tu plan <strong>{paquete.get('nombre')}</strong> se renovó exitosamente. Tu nueva fecha de vencimiento es <strong>{nueva_fin}</strong>.")
              continue  # Ya se renovó, no mandar aviso de vencimiento

          except Exception as e:
            print(f"❌ Error cobrando renovación de {email}: {e}")
            supabase.table("alertas").insert({
              "tipo":        "pago_fallido",
              "categoria":   "operacion",
              "titulo":      f"Renovación fallida — {cliente.get('nombre_completo')}",
              "descripcion": str(e),
              "cliente_id":  cliente_id,
            }).execute()

        # Cobro falló o sin tarjeta — mandar aviso
        msg_push = f"Tenemos un problema con tu tarjeta. Actualízala para renovar tu plan {paquete.get('nombre')} que vence en {dias} día{'s' if dias > 1 else ''}."
        msg_correo = f"Intentamos renovar tu plan <strong>{paquete.get('nombre')}</strong> automáticamente pero no pudimos cobrar tu tarjeta. Tu membresía vence en <strong>{dias} día{'s' if dias > 1 else ''}</strong>. Por favor actualiza tu método de pago."
        subj = f"⚠️ Problema con tu renovación — vence en {dias} día{'s' if dias > 1 else ''}"

      else:
        # Pago único — solo avisar que vence
        msg_push   = f"Tu plan {paquete.get('nombre')} vence en {dias} día{'s' if dias > 1 else ''}. ¡Renuévalo para seguir entrenando!"
        msg_correo = f"Tu plan <strong>{paquete.get('nombre')}</strong> vence en <strong>{dias} día{'s' if dias > 1 else ''}</strong>. Entra a la app para renovarlo."
        subj       = f"Tu membresía Navy vence en {dias} día{'s' if dias > 1 else ''} ⏰"

      await enviar_push(tokens,
        titulo=f"⚠️ Membresía por vencer — {dias} día{'s' if dias > 1 else ''}",
        cuerpo=msg_push,
        data={"tipo": "membresia_vence", "membresia_id": m["id"]})
      await enviar_correo(email, nombre, subj, msg_correo)

  # Día del vencimiento — cancelar membresías vencidas
  membresias_vencidas = supabase.table("membresias")\
    .select("*, clientes(id, nombre_completo, email, push_tokens(token))")\
    .eq("estatus", "Activa")\
    .lt("fecha_fin", hoy.isoformat())\
    .execute()

  for m in (membresias_vencidas.data or []):
    cliente  = m.get("clientes", {})
    nombre   = (cliente.get("nombre_completo") or "").split()[0]
    email    = cliente.get("email")
    tokens   = [pt["token"] for pt in (cliente.get("push_tokens") or [])]
    cliente_id = cliente.get("id")

    supabase.table("membresias").update({ "estatus": "Inactiva" }).eq("id", m["id"]).execute()
    supabase.table("clientes").update({ "estatus": "Inactivo" }).eq("id", cliente_id).execute()

    await enviar_push(tokens,
      titulo="❌ Tu membresía ha vencido",
      cuerpo="Tu membresía Navy ha vencido. Entra a la app para renovarla y seguir entrenando.",
      data={"tipo": "membresia_vencida"})
    await enviar_correo(email, nombre,
      "Tu membresía Navy ha vencido",
      "Tu membresía ha vencido y tu acceso ha sido suspendido. Entra a la app para renovarla y seguir entrenando con nosotros.")
    print(f"❌ Membresía vencida y cancelada: {email}")