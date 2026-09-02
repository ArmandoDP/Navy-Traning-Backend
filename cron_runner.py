import asyncio
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from services.push import (
  check_recordatorios_clase,
  check_membresias_por_vencer,
  check_no_shows,
  check_clases_en_curso,
  check_renovaciones_recurrentes,
)

scheduler = AsyncIOScheduler()

# Cada hora en punto — recordatorios de clase
scheduler.add_job(check_recordatorios_clase, 'cron', minute='0')

# Cada 15 minutos — clases en curso
scheduler.add_job(check_clases_en_curso, 'cron', minute='*/15')

# Cada hora a los :30 — no shows
scheduler.add_job(check_no_shows, 'cron', minute='30')

# Diario a las 8am CST (14 UTC) — membresías por vencer y renovaciones
scheduler.add_job(check_membresias_por_vencer,       'cron', hour='14', minute='0')
scheduler.add_job(check_renovaciones_recurrentes,    'cron', hour='14', minute='5')

scheduler.start()
print("✅ Cron runner iniciado")

try:
  asyncio.get_event_loop().run_forever()
except (KeyboardInterrupt, SystemExit):
  pass