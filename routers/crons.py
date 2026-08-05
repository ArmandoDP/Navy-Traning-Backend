from fastapi import APIRouter, Header, HTTPException
from services.push import check_recordatorios_clase, check_membresias_por_vencer
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