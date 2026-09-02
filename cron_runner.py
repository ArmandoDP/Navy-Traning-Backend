import asyncio
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from services.push import (
  check_recordatorios_clase,
  check_membresias_por_vencer,
  check_no_shows,
  check_clases_en_curso,
  check_renovaciones_recurrentes,
)

async def main():
  scheduler = AsyncIOScheduler()

  scheduler.add_job(check_recordatorios_clase,       'cron', minute='0')
  scheduler.add_job(check_clases_en_curso,           'cron', minute='*/15')
  scheduler.add_job(check_no_shows,                  'cron', minute='30')
  scheduler.add_job(check_membresias_por_vencer,     'cron', hour='14', minute='0')
  scheduler.add_job(check_renovaciones_recurrentes,  'cron', hour='14', minute='5')

  scheduler.start()
  print("✅ Cron runner iniciado")

  try:
    await asyncio.Event().wait()
  except (KeyboardInterrupt, SystemExit):
    pass

if __name__ == '__main__':
  asyncio.run(main())