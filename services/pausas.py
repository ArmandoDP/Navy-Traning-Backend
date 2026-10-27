# services/pausas.py — al terminar los días de pausa, la membresía vuelve a estar activa sola.
from datetime import date, datetime, timedelta, timezone
from services.supabase import supabase
from services.stripe_activacion import push_cliente

CDMX = timezone(timedelta(hours=-6))


async def reanudar_pausas_vencidas() -> dict:
  hoy = datetime.now(CDMX).date()
  pausadas = supabase.table("membresias").select("id, cliente_id, fecha_fin, paquetes(nombre)").eq("estatus", "Pausada").execute().data or []
  reanudadas = 0
  for m in pausadas:
    ult = supabase.table("membresia_pausas").select("evento, fecha_inicio_pausa, dias_pausados")\
      .eq("membresia_id", m["id"]).order("created_at", desc=True).limit(1).execute().data
    if not ult or ult[0].get("evento") != "PAUSA" or not ult[0].get("fecha_inicio_pausa"):
      continue
    inicio = date.fromisoformat(str(ult[0]["fecha_inicio_pausa"])[:10])
    regresa = inicio + timedelta(days=int(ult[0].get("dias_pausados") or 0))
    if regresa > hoy:
      continue
    supabase.table("membresias").update({"estatus": "Activa"}).eq("id", m["id"]).eq("estatus", "Pausada").execute()
    reanudadas += 1
    plan = (m.get("paquetes") or {}).get("nombre") or "Tu plan"
    try:
      supabase.table("actividad_log").insert({
        "tipo": "membresia_reanudada", "tabla": "membresias", "accion": "UPDATE",
        "descripcion": f"Terminó la pausa de {plan}: vuelve a estar activa (vence el {m.get('fecha_fin')})",
        "metadata": {"membresia_id": m["id"], "cliente_id": m["cliente_id"], "automatica": True},
      }).execute()
    except Exception as e:
      print("pausas log:", e)
    try:
      fin = date.fromisoformat(str(m["fecha_fin"])[:10]).strftime("%d/%m/%Y") if m.get("fecha_fin") else ""
      await push_cliente(m["cliente_id"], "¡Tu membresía está activa de nuevo! 💪",
                         f"Terminó tu pausa. {plan} ya está activo{f' hasta el {fin}' if fin else ''}. ¡Reserva tu próxima clase!",
                         {"tipo": "membresia_reanudada"})
    except Exception as e:
      print("pausas push:", e)
  print(f"⏯️ Pausas terminadas: {reanudadas} membresías reactivadas")
  return {"revisadas": len(pausadas), "reanudadas": reanudadas}