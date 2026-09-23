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
  print("🔄 Sincronizando planes de clientes...")
  membs = supabase.table("membresias")\
    .select("cliente_id, paquete_id, paquetes(nombre)")\
    .eq("estatus", "Activa").execute()
  
  for m in (membs.data or []):
    supabase.table("clientes").update({
      "plan":       m["paquetes"]["nombre"] if m.get("paquetes") else "",
      "paquete_id": m["paquete_id"],
    }).eq("id", m["cliente_id"]).execute()
  
  print(f"✅ {len(membs.data or [])} planes sincronizados")

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