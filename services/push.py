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
      .select("*, clientes(nombre_completo, email, push_tokens(token)), paquetes(nombre)")\
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