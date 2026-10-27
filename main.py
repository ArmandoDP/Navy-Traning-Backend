from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from routers import (
  crons, pagos, totalpass, totalpass_booking, totalpass_checkin, clientes, clases, wellhub,
  confirmar_reserva, sincronizacion, editar_clase, stripe_pagos, membresias, soporte, cobros, estado_clientes, metas, lista_espera, mis_pagos, clientes_admin, promociones,
)
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from services.push import (
  check_recordatorios_clase,
  check_membresias_por_vencer,
  check_no_shows,
  check_clases_en_curso,
)
from services.estado_clientes import sincronizar_todos as sincronizar_estado_clientes
from services.metas import evaluar_todas as evaluar_metas, recordatorio_noche as recordatorio_metas
from services.lista_espera import procesar_eventos as avisos_lista_espera, cerrar_listas as cerrar_listas_espera
from services.tarjetas import recordatorio_tarjeta
from services.membresias_pendientes import (
  sincronizar_stripe_membresias,
  activar_membresias_por_tiempo,
  invitar_a_reservar,
)

load_dotenv()

app = FastAPI(title="Navy Backend")

app.add_middleware(
  CORSMiddleware,
  allow_origins=[
    "http://localhost:3000",
    "https://crm.navytrainingcenter.com",
  ],
  allow_methods=["*"],
  allow_headers=["*"],
)

# Routers
app.include_router(crons.router,             prefix="/crons")
app.include_router(pagos.router,             prefix="/pagos")              # OrkestaPay (apagado)
app.include_router(totalpass.router,         prefix="/totalpass")
app.include_router(totalpass_booking.router, prefix="/totalpass-booking")
app.include_router(totalpass_checkin.router, prefix="/totalpass-checkin")
app.include_router(clientes.router,          prefix="/clientes")
app.include_router(clases.router,            prefix="/clases")
app.include_router(editar_clase.router,      prefix="/clases")             # /clases/actualizar
app.include_router(wellhub.router,           prefix="/wellhub")
app.include_router(sincronizacion.router,    prefix="/sync")               # /sync/cupos
app.include_router(stripe_pagos.router,      prefix="/stripe")             # pagos con Stripe
app.include_router(membresias.router,        prefix="/membresias")         # fechas de membresías
app.include_router(soporte.router,           prefix="/soporte")            # diagnóstico de clientes
app.include_router(cobros.router,            prefix="/cobros")             # cobrar sin terminal
app.include_router(estado_clientes.router,   prefix="/clientes-estado")    # plan y estado de clientes
app.include_router(metas.router,             prefix="/metas")              # metas de entrenamiento
app.include_router(lista_espera.router,      prefix="/lista-espera")       # lista de espera de clases
app.include_router(mis_pagos.router,         prefix="/mis-pagos")          # historial, detalle, PDF y tarjeta
app.include_router(clientes_admin.router,    prefix="/clientes-admin")     # eliminar y unir clientes (dirección)
app.include_router(promociones.router,       prefix="/promociones")        # descuentos y promociones
app.include_router(confirmar_reserva.router)                               # sin prefix

# Scheduler (horas en UTC: CDMX = UTC-6)
scheduler = AsyncIOScheduler()

@app.on_event("startup")
async def startup():
  scheduler.add_job(check_recordatorios_clase,     'cron', minute=0)
  scheduler.add_job(check_membresias_por_vencer,   'cron', hour=14, minute=0)
  scheduler.add_job(check_no_shows,                'cron', minute=30)
  scheduler.add_job(check_clases_en_curso,         'cron', minute='*/15')
  scheduler.add_job(sincronizar_stripe_membresias, 'interval', minutes=10)
  scheduler.add_job(activar_membresias_por_tiempo, 'cron', hour=6,  minute=10)   # 00:10 CDMX
  scheduler.add_job(invitar_a_reservar,            'cron', hour=16, minute=0)    # 10:00 CDMX
  scheduler.add_job(sincronizar_estado_clientes,   'cron', minute=5)              # cada hora (incluye 00:05 CDMX)
  scheduler.add_job(evaluar_metas,                 'cron', minute='*/15')          # check-ins, días y semanas
  scheduler.add_job(recordatorio_metas,            'cron', hour=2, minute=0)       # 20:00 CDMX
  scheduler.add_job(avisos_lista_espera,           'interval', seconds=30)         # avisos de lista de espera
  scheduler.add_job(cerrar_listas_espera,          'interval', minutes=5)          # cierre de la asignación automática
  scheduler.add_job(recordatorio_tarjeta,          'cron', hour=17, minute=0)     # 11:00 CDMX: tarjeta antes de que venza el plan
  scheduler.start()

@app.on_event("shutdown")
async def shutdown():
  scheduler.shutdown()

@app.get("/")
def root():
  return { "status": "Navy Backend OK" }