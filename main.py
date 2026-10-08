from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from routers import (
  crons, pagos, totalpass, totalpass_booking, totalpass_checkin, clientes, clases, wellhub,
  confirmar_reserva, sincronizacion, editar_clase, stripe_pagos, membresias,
)
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from services.push import (
  check_recordatorios_clase,
  check_membresias_por_vencer,
  check_no_shows,
  check_clases_en_curso,
)
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
  scheduler.start()

@app.on_event("shutdown")
async def shutdown():
  scheduler.shutdown()

@app.get("/")
def root():
  return { "status": "Navy Backend OK" }