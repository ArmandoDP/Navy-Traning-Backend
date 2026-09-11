from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from routers import crons, pagos, totalpass, totalpass_booking, clientes, clases
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from services.push import (
  check_recordatorios_clase,
  check_membresias_por_vencer,
  check_no_shows,
  check_clases_en_curso,
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
app.include_router(pagos.router,             prefix="/pagos")
app.include_router(totalpass.router,         prefix="/totalpass")
app.include_router(totalpass_booking.router, prefix="/totalpass-booking")
app.include_router(clientes.router,          prefix="/clientes")
app.include_router(clases.router,            prefix="/clases")

# Scheduler
scheduler = AsyncIOScheduler()

@app.on_event("startup")
async def startup():
  scheduler.add_job(check_recordatorios_clase,   'cron', minute=0)
  scheduler.add_job(check_membresias_por_vencer, 'cron', hour=14, minute=0)
  scheduler.add_job(check_no_shows,              'cron', minute=30)
  scheduler.add_job(check_clases_en_curso,       'cron', minute='*/15')
  scheduler.start()

@app.on_event("shutdown")
async def shutdown():
  scheduler.shutdown()

@app.get("/")
def root():
  return { "status": "Navy Backend OK" }