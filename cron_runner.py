import asyncio
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from services.push import (
  check_recordatorios_clase,
  check_membresias_por_vencer,
  check_no_shows,
  check_clases_en_curso,
  check_renovaciones_recurrentes,
)
from services.supabase import supabase

async def sincronizar_planes():
  from datetime import date
  print("🔄 Sincronizando planes de clientes...")
  hoy = date.today().isoformat()

  membs = supabase.table("membresias")\
    .select("cliente_id, paquete_id, fecha_fin, paquetes(nombre, tipo)")\
    .eq("estatus", "Activa")\
    .order("fecha_fin", desc=True)\
    .execute()

  procesados = set()
  actualizados = 0

  for m in (membs.data or []):
    cliente_id = m["cliente_id"]
    if cliente_id in procesados:
      continue
    procesados.add(cliente_id)

    # Paquetes tipo 'clases' no vencen por fecha
    tipo = m.get("paquetes", {}).get("tipo") if m.get("paquetes") else None
    if tipo == "clases":
      estatus_cliente = "Activo"
    else:
      estatus_cliente = "Activo" if m["fecha_fin"] >= hoy else "Activo"

    supabase.table("clientes").update({
      "plan":            m["paquetes"]["nombre"] if m.get("paquetes") else "",
      "paquete_id":      m["paquete_id"],
      "fecha_venc_plan": m["fecha_fin"],
      "estatus":         estatus_cliente,
    }).eq("id", cliente_id).execute()
    actualizados += 1

  # Clientes activos sin membresía activa → dejar activos pero sin plan
  clientes_activos = supabase.table("clientes").select("id")\
    .eq("estatus", "Activo").execute()

  sin_plan = 0
  for c in (clientes_activos.data or []):
    if c["id"] not in procesados:
      supabase.table("clientes").update({
        "plan":            "",
        "paquete_id":      None,
        "fecha_venc_plan": None,
      }).eq("id", c["id"]).execute()
      sin_plan += 1

  print(f"✅ {actualizados} planes sincronizados | {sin_plan} sin plan activo")
  
async def main():
  scheduler = AsyncIOScheduler()

  scheduler.add_job(check_recordatorios_clase,       'cron', minute='0')
  scheduler.add_job(check_clases_en_curso,           'cron', minute='*/15')
  scheduler.add_job(check_no_shows,                  'cron', minute='30')
  scheduler.add_job(check_membresias_por_vencer,     'cron', hour='14', minute='0')
  scheduler.add_job(check_renovaciones_recurrentes,  'cron', hour='14', minute='5')
  scheduler.add_job(sincronizar_planes,              'cron', minute='*/30')  # cada 30 min

  scheduler.start()
  print("✅ Cron runner iniciado")

  try:
    await asyncio.Event().wait()
  except (KeyboardInterrupt, SystemExit):
    pass

if __name__ == '__main__':
  asyncio.run(main())