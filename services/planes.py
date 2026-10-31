# services/planes.py — cada hora: cierra los planes que terminaron (por fecha o por clases)
# y hace entrar al siguiente de la fila. La regla vive en la base (función avanzar_planes).
from services.supabase import supabase


async def avanzar_planes() -> dict:
  try:
    r = supabase.rpc("avanzar_planes").execute().data or {}
    print(f"🔁 Planes: {r}")
    return r
  except Exception as e:
    print("avanzar_planes:", e)
    return {}
  