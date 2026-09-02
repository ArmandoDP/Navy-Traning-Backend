from fastapi import APIRouter, Header, HTTPException
from services.push import check_recordatorios_clase, check_membresias_por_vencer, check_no_shows
import os

router = APIRouter()

CRON_SECRET = os.getenv("CRON_SECRET", "navy-cron-secret")

@router.post("/recordatorios-clase")
async def run_recordatorios(x_cron_secret: str = Header(None)):
  if x_cron_secret != CRON_SECRET:
    raise HTTPException(status_code=401, detail="Unauthorized")
  await check_recordatorios_clase()
  return { "ok": True, "job": "recordatorios_clase" }

@router.post("/membresias-vencer")
async def run_membresias(x_cron_secret: str = Header(None)):
  if x_cron_secret != CRON_SECRET:
    raise HTTPException(status_code=401, detail="Unauthorized")
  await check_membresias_por_vencer()
  return { "ok": True, "job": "membresias_vencer" }

@router.post("/no-shows")
async def run_no_shows(x_cron_secret: str = Header(None)):
  if x_cron_secret != CRON_SECRET:
    raise HTTPException(status_code=401, detail="Unauthorized")
  await check_no_shows()
  return { "ok": True, "job": "no_shows" }

@router.post("/clases-en-curso")
async def run_clases_en_curso(x_cron_secret: str = Header(None)):
  if x_cron_secret != CRON_SECRET:
    raise HTTPException(status_code=401, detail="Unauthorized")
  await check_clases_en_curso()
  return { "ok": True, "job": "clases_en_curso" }

@router.post("/renovar-membresias")
async def run_renovar_membresias(x_cron_secret: str = Header(None)):
  if x_cron_secret != CRON_SECRET:
    raise HTTPException(status_code=401, detail="Unauthorized")
  from services.push import check_renovaciones_recurrentes
  await check_renovaciones_recurrentes()
  return { "ok": True, "job": "renovar_membresias" }
