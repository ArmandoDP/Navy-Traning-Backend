from datetime import datetime, timedelta, timezone
import asyncio
from fastapi import APIRouter, HTTPException, Request
import httpx
import os
from services.push import enviar_push
from services.supabase import supabase
from services.auth_app import staff_de_sesion

router = APIRouter()

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY")
RESEND_KEY   = os.getenv("RESEND_API_KEY")
MESES        = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']


def fmt_fecha(iso: str) -> str:
    from datetime import datetime
    dt = datetime.fromisoformat(iso.replace('Z', '+00:00'))
    return f"{dt.day} de {MESES[dt.month - 1]} de {dt.year}"


def fmt_hora(iso: str) -> str:
    from datetime import datetime, timedelta
    dt = datetime.fromisoformat(iso.replace('Z', '+00:00'))
    dt_cdmx = dt - timedelta(hours=6)
    return dt_cdmx.strftime("%I:%M %p").lstrip('0')


async def enviar_correo_cancelacion(email: str, nombre: str, clase: dict, sucursal: str):
    nombre1   = nombre.split()[0] if nombre else 'cliente'
    fecha_str = fmt_fecha(clase['horario'])
    hora_str  = fmt_hora(clase['horario'])
    clase_nom = clase['nombre_clase']
    duracion  = clase.get('duracion_minutos', 60)

    html = f"""<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Clase cancelada - NAVY</title>
</head>
<body style="margin:0;padding:0;background:#0f172a;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#0f172a;">
<tr><td align="center" style="padding:32px 12px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:600px;">
  <tr><td style="background:linear-gradient(145deg,#0f172a,#171B24,#1e2d40,#0f172a);border-radius:28px 28px 0 0;padding:52px 52px 44px;text-align:center;">
    <img src="https://crm.navytrainingcenter.com/email/logo-navy.png" alt="NAVY" width="140" style="display:block;width:140px;height:auto;border:0;margin:0 auto 24px;filter:brightness(0) invert(1);">
    <div style="width:56px;height:56px;background:rgba(239,68,68,0.15);border:2px solid rgba(239,68,68,0.3);border-radius:50%;margin:0 auto 20px;line-height:56px;font-size:24px;text-align:center;">X</div>
    <p style="color:#f1f5f9;font-size:26px;font-weight:900;margin:0 0 8px;">Clase cancelada</p>
    <p style="color:#475569;font-size:14px;margin:0;">Hola {nombre1}, te informamos que una de tus clases ha sido cancelada</p>
  </td></tr>
  <tr><td style="background:#171B24;padding:44px 52px;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:20px;overflow:hidden;">
      <tr><td style="background:rgba(239,68,68,0.12);padding:20px 28px;border-bottom:1px solid rgba(239,68,68,0.2);">
        <p style="color:#fca5a5;font-size:10px;font-weight:700;letter-spacing:4px;text-transform:uppercase;margin:0 0 4px;">Clase cancelada</p>
        <p style="color:#f1f5f9;font-size:22px;font-weight:900;margin:0;">{clase_nom}</p>
      </td></tr>
      <tr><td style="padding:20px 28px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="padding:10px 0;border-bottom:1px solid #1e3a5f;">
            <table width="100%"><tr>
              <td style="color:#475569;font-size:13px;">Fecha</td>
              <td align="right" style="color:#cbd5e1;font-size:13px;font-weight:700;">{fecha_str}</td>
            </tr></table>
          </td></tr>
          <tr><td style="padding:10px 0;border-bottom:1px solid #1e3a5f;">
            <table width="100%"><tr>
              <td style="color:#475569;font-size:13px;">Hora</td>
              <td align="right" style="color:#cbd5e1;font-size:13px;font-weight:700;">{hora_str}</td>
            </tr></table>
          </td></tr>
          <tr><td style="padding:10px 0;border-bottom:1px solid #1e3a5f;">
            <table width="100%"><tr>
              <td style="color:#475569;font-size:13px;">Duracion</td>
              <td align="right" style="color:#cbd5e1;font-size:13px;font-weight:700;">{duracion} min</td>
            </tr></table>
          </td></tr>
          <tr><td style="padding:10px 0;">
            <table width="100%"><tr>
              <td style="color:#475569;font-size:13px;">Sucursal</td>
              <td align="right" style="color:#cbd5e1;font-size:13px;font-weight:700;">{sucursal}</td>
            </tr></table>
          </td></tr>
        </table>
      </td></tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;">
      <tr><td style="background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.2);border-radius:14px;padding:20px 24px;">
        <p style="color:#a5b4fc;font-size:14px;font-weight:700;margin:0 0 8px;">Tu reserva fue cancelada automaticamente</p>
        <p style="color:#64748b;font-size:13px;line-height:20px;margin:0;">Esta clase no contara como no-show. Puedes reservar otra clase desde la app cuando quieras.</p>
      </td></tr>
    </table>
  </td></tr>
  <tr><td style="background:linear-gradient(145deg,#0f172a,#171B24);border-radius:0 0 28px 28px;padding:32px 52px;text-align:center;">
    <p style="color:#1e3a5f;font-size:10px;margin:0;letter-spacing:2px;text-transform:uppercase;">2026 Navy Training Center - navytrainingcenter.com</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>"""

    async with httpx.AsyncClient(timeout=15.0) as client:
        await client.post(
            'https://api.resend.com/emails',
            headers={'Authorization': f'Bearer {RESEND_KEY}', 'Content-Type': 'application/json'},
            json={
                'from':    'Navy Training Center <noreply@navytrainingcenter.com>',
                'to':      email,
                'subject': f'Clase cancelada - {clase_nom}',
                'html':    html,
            }
        )


FRASE_CONFIRMACION = "CANCELAR CLASE"
WELLHUB_GYM_IDS = {
    "1b2032dc-f5da-40c6-8c4e-e227be14673b": "848637",  # Condesa Gym
    "f8f798a8-d89b-4874-a53a-cdcb6325ad2a": "848638",  # Condesa Studio
}


def _clase(clase_id: str) -> dict:
    c = supabase.table("clases").select(
        "id, nombre_clase, horario, duracion_minutos, sucursal_id, estado, wellhub_slot_id, wellhub_class_id, "
        "totalpass_occurrence_uuid, sucursales(nombre, totalpass_place_api_key)"
    ).eq("id", clase_id).limit(1).execute().data
    if not c:
        raise HTTPException(status_code=404, detail="Clase no encontrada")
    return c[0]


def _reservas(clase_id: str) -> list[dict]:
    return supabase.table("reservas").select("id, cliente_id, origen, estatus, clientes(nombre_completo, email)")\
        .eq("clase_id", clase_id).neq("estatus", "Cancelada").execute().data or []


def _aviso(origen: str | None) -> str:
    o = (origen or "").lower()
    if "wellhub" in o:   return "Wellhub le avisa al quitar la clase"
    if "totalpass" in o: return "TotalPass le avisa al quitar la clase"
    return "Correo y notificación de Navy"


@router.get("/{clase_id}/cancelacion")
async def vista_previa_cancelacion(clase_id: str, request: Request):
    """Lo que va a pasar si se cancela: a quién se le avisa y cómo. Dirección, gerentes y recepción."""
    staff_de_sesion(request, roles=["direccion", "gerente", "staff_navy"])
    clase = _clase(clase_id)
    reservas = _reservas(clase_id)
    return {
        "clase": {"id": clase["id"], "nombre": (clase["nombre_clase"] or "").strip(), "horario": clase["horario"],
                  "sucursal": (clase.get("sucursales") or {}).get("nombre"),
                  "en_wellhub": bool(clase.get("wellhub_slot_id")), "en_totalpass": bool(clase.get("totalpass_occurrence_uuid"))},
        "reservas": [{"cliente": (r.get("clientes") or {}).get("nombre_completo") or "Cliente",
                      "email": (r.get("clientes") or {}).get("email"), "origen": r.get("origen") or "App",
                      "aviso": _aviso(r.get("origen"))} for r in reservas],
        "frase": FRASE_CONFIRMACION,
    }


@router.post("/cancelar")
async def cancelar_clase(req: dict, request: Request):
    """Cancela Y elimina la clase, todo junto. Dirección, gerentes y recepción, escribiendo la frase de confirmación.
    1) la quita de Wellhub y TotalPass (si alguna falla, no se toca nada, salvo que se pida forzar) ·
    2) avisa a los clientes de Navy (correo + notificación) · 3) elimina la clase con todas sus reservas ·
    4) queda en el historial quién lo hizo y a quién se avisó."""
    staff = staff_de_sesion(request, roles=["direccion", "gerente", "staff_navy"])
    clase_id = req.get("clase_id")
    if not clase_id:
        raise HTTPException(status_code=400, detail="clase_id requerido")
    if (req.get("confirmacion") or "").strip().upper() != FRASE_CONFIRMACION:
        raise HTTPException(status_code=400, detail=f'Para cancelar, escribe exactamente "{FRASE_CONFIRMACION}".')

    clase = _clase(clase_id)
    reservas = _reservas(clase_id)
    sucursal = (clase.get("sucursales") or {}).get("nombre", "Navy Training Center")
    quien = f"{staff.get('nombre') or ''} {staff.get('primer_apellido') or ''}".strip() or "Dirección"

    # 1. Plataformas
    problemas = []
    async with httpx.AsyncClient(timeout=30.0) as client:
        slot, cls, gym = clase.get("wellhub_slot_id"), clase.get("wellhub_class_id"), WELLHUB_GYM_IDS.get(clase.get("sucursal_id"))
        if slot and cls and gym:
            try:
                r = await client.delete(
                    f"https://api.partners.gympass.com/booking/v1/gyms/{gym}/classes/{cls}/slots/{slot}",
                    headers={"Authorization": f"Bearer {os.getenv('WELLHUB_API_KEY')}", "Content-Type": "application/json"})
                if r.status_code >= 400 and r.status_code != 404:
                    problemas.append(f"Wellhub ({r.status_code}: {r.text[:150]})")
            except Exception as e:
                problemas.append(f"Wellhub no respondió ({e})")
        occ, key = clase.get("totalpass_occurrence_uuid"), (clase.get("sucursales") or {}).get("totalpass_place_api_key")
        if occ and key:
            try:
                auth = await client.post("https://booking-api.totalpass.com/partner/auth",
                                         json={"partner_api_key": os.getenv("TOTALPASS_PARTNER_API_KEY"), "place_api_key": key})
                token = auth.json().get("token")
                r = await client.delete(f"https://booking-api.totalpass.com/partner/event-occurrence/{occ}",
                                        headers={"Authorization": f"Bearer {token}", "accept": "application/json"}) if token else None
                if r is None or (r.status_code >= 400 and r.status_code != 404):
                    problemas.append(f"TotalPass ({getattr(r, 'status_code', 'sin acceso')})")
            except Exception as e:
                problemas.append(f"TotalPass no respondió ({e})")

    if problemas and not req.get("forzar"):
        raise HTTPException(status_code=502, detail={
            "mensaje": "No se pudo quitar la clase de: " + " · ".join(problemas) + ". No se tocó nada.",
            "puede_forzar": True})

    # 2. Avisos a clientes de Navy (los de Wellhub y TotalPass los avisa su plataforma)
    navy = [r for r in reservas if "wellhub" not in (r.get("origen") or "").lower() and "totalpass" not in (r.get("origen") or "").lower()]
    tokens = {}
    ids = [r["cliente_id"] for r in navy if r.get("cliente_id")]
    if ids:
        for t in supabase.table("push_tokens").select("cliente_id, token").in_("cliente_id", ids).execute().data or []:
            tokens.setdefault(t["cliente_id"], []).append(t["token"])
    hora, fecha, nombre = fmt_hora(clase["horario"]), fmt_fecha(clase["horario"]), (clase["nombre_clase"] or "").strip()
    avisados = 0
    for rv in navy:
        cli = rv.get("clientes") or {}
        try:
            if tokens.get(rv.get("cliente_id")):
                await enviar_push(tokens[rv["cliente_id"]], titulo=f"Clase cancelada - {nombre}",
                                  cuerpo=f"Tu clase del {fecha} a las {hora} en {sucursal} fue cancelada. Puedes reservar otra.",
                                  data={"tipo": "clase_cancelada", "clase_id": clase_id})
            if cli.get("email"):
                await enviar_correo_cancelacion(cli["email"], cli.get("nombre_completo", ""), clase, sucursal)
            avisados += 1
        except Exception as e:
            print(f"Aviso cancelación {cli.get('email')}:", e)

    # 3. Eliminar la clase con todo lo suyo (queda copia en la papelera y el historial)
    resumen = (f"Canceló y eliminó la clase. Avisos: {avisados} de Navy por correo y notificación"
               f"{f', {len(reservas) - len(navy)} de Wellhub/TotalPass por su plataforma' if len(reservas) > len(navy) else ''}"
               f"{'. OJO: hubo que forzarla (' + ' · '.join(problemas) + ')' if problemas else ''}")
    detalle = supabase.rpc("eliminar_clase", {"p_clase": clase_id, "p_quien": quien, "p_resumen": resumen}).execute().data
    try:
        supabase.table("actividad_log").insert({
            "tipo": "clase_cancelada", "tabla": "clases", "accion": "DELETE", "staff_id": staff.get("id"),
            "descripcion": f"{quien} canceló y eliminó \"{nombre}\" del {fecha} a las {hora} ({len(reservas)} reservas, {avisados} avisados por Navy)",
            "metadata": {"clase_id": clase_id, "reservas": len(reservas), "avisados": avisados, "forzada": bool(problemas)},
            "sucursal_id": clase.get("sucursal_id"),
        }).execute()
    except Exception as e:
        print("log cancelar clase:", e)

    return {"ok": True, "clase_eliminada": clase_id, "reservas": len(reservas), "avisados_navy": avisados,
            "plataformas": len(reservas) - len(navy), "forzada": bool(problemas), "detalle": detalle}


async def _quitar_de_plataformas(client: httpx.AsyncClient, clase: dict) -> list[str]:
    """Quita la clase de Wellhub y TotalPass. Regresa la lista de problemas (vacía = todo bien)."""
    problemas = []
    slot, cls, gym = clase.get("wellhub_slot_id"), clase.get("wellhub_class_id"), WELLHUB_GYM_IDS.get(clase.get("sucursal_id"))
    if slot and cls and gym:
        try:
            r = await client.delete(f"https://api.partners.gympass.com/booking/v1/gyms/{gym}/classes/{cls}/slots/{slot}",
                                    headers={"Authorization": f"Bearer {os.getenv('WELLHUB_API_KEY')}", "Content-Type": "application/json"})
            if r.status_code >= 400 and r.status_code != 404:
                problemas.append(f"Wellhub {r.status_code}: {r.text[:120]}")
        except Exception as e:
            problemas.append(f"Wellhub: {e}")
    occ, key = clase.get("totalpass_occurrence_uuid"), (clase.get("sucursales") or {}).get("totalpass_place_api_key")
    if occ and key:
        try:
            auth = await client.post("https://booking-api.totalpass.com/partner/auth",
                                     json={"partner_api_key": os.getenv("TOTALPASS_PARTNER_API_KEY"), "place_api_key": key})
            token = auth.json().get("token")
            r = await client.delete(f"https://booking-api.totalpass.com/partner/event-occurrence/{occ}",
                                    headers={"Authorization": f"Bearer {token}", "accept": "application/json"}) if token else None
            if r is None or (r.status_code >= 400 and r.status_code != 404):
                problemas.append(f"TotalPass {getattr(r, 'status_code', 'sin acceso')}")
        except Exception as e:
            problemas.append(f"TotalPass: {e}")
    return problemas


def _grupos_duplicados(dias: int) -> list[list[dict]]:
    """Clases activas repetidas (mismo nombre, sucursal y hora) en los próximos `dias` días."""
    hasta = (datetime.now(timezone.utc) + timedelta(days=dias)).isoformat()
    filas = supabase.table("clases").select(
        "id, nombre_clase, horario, sucursal_id, room_id, coach_id, instructor, wellhub_slot_id, wellhub_class_id, "
        "totalpass_occurrence_uuid, sucursales(nombre, totalpass_place_api_key), staff(nombre, primer_apellido), "
        "reservas(id, cliente_id, origen, estatus, spot_id)"
    ).eq("estado", "Activa").gte("horario", datetime.now(timezone.utc).isoformat()).lt("horario", hasta).execute().data or []
    grupos: dict = {}
    for c in filas:
        c["reservas"] = [r for r in (c.get("reservas") or []) if r.get("estatus") not in ("Cancelada", "Cancelado")]
        clave = (" ".join((c["nombre_clase"] or "").upper().split()), c["sucursal_id"], c["horario"])
        grupos.setdefault(clave, []).append(c)
    return [g for g in grupos.values() if len(g) > 1]


def _plan_grupo(g: list[dict]) -> dict:
    """Se queda la que tiene más gente; empate: la que está publicada en más plataformas."""
    g = sorted(g, key=lambda c: (len(c["reservas"]), bool(c.get("wellhub_slot_id")) + bool(c.get("totalpass_occurrence_uuid"))), reverse=True)
    queda, sobran = g[0], g[1:]
    en_queda = {r["cliente_id"] for r in queda["reservas"]}
    lugares = {r.get("spot_id") for r in queda["reservas"] if r.get("spot_id")}
    mover, perderian = [], []
    for c in sobran:
        for r in c["reservas"]:
            if r["cliente_id"] in en_queda:
                continue                                         # ya está también en la que se queda
            if "wellhub" in (r.get("origen") or "").lower() or "totalpass" in (r.get("origen") or "").lower():
                perderian.append({"reserva_id": r["id"], "cliente_id": r["cliente_id"], "origen": r.get("origen")})
            else:
                spot = r.get("spot_id") if r.get("spot_id") not in lugares else None
                if spot: lugares.add(spot)
                mover.append({"reserva_id": r["id"], "spot_id": spot, "cambio_lugar": bool(r.get("spot_id")) and not spot})
    coach = lambda c: f"{(c.get('staff') or {}).get('nombre') or c.get('instructor') or '—'}".strip()
    return {
        "clase": (queda["nombre_clase"] or "").strip(), "sucursal": (queda.get("sucursales") or {}).get("nombre"),
        "horario": queda["horario"],
        "se_queda": {"id": queda["id"], "coach": coach(queda), "reservas": len(queda["reservas"])},
        "se_eliminan": [{"id": c["id"], "coach": coach(c), "reservas": len(c["reservas"])} for c in sobran],
        "mover": mover, "perderian_su_lugar_en_plataforma": perderian, "_sobran": sobran, "_queda": queda,
    }


@router.get("/duplicados")
async def ver_duplicados(request: Request, dias: int = 14):
    """Vista previa: qué clases están repetidas y qué se haría con cada una. No cambia nada."""
    staff_de_sesion(request, roles=["direccion"])
    planes = [_plan_grupo(g) for g in _grupos_duplicados(dias)]
    return {"grupos": len(planes), "detalle": [{k: v for k, v in p.items() if not k.startswith("_")} for p in planes]}


@router.post("/limpiar-duplicados")
async def limpiar_duplicados(req: dict, request: Request):
    """Junta a la gente en una sola clase y elimina las repetidas del CRM, Wellhub y TotalPass. Solo dirección."""
    staff = staff_de_sesion(request, roles=["direccion"])
    if (req.get("confirmacion") or "").strip().upper() != "LIMPIAR DUPLICADOS":
        raise HTTPException(status_code=400, detail='Para limpiar, manda confirmacion = "LIMPIAR DUPLICADOS".')
    quien = f"{staff.get('nombre') or ''} {staff.get('primer_apellido') or ''}".strip() or "Dirección"
    resultado = []
    async with httpx.AsyncClient(timeout=30.0) as client:
        for g in _grupos_duplicados(int(req.get("dias") or 14)):
            p = _plan_grupo(g)
            # 1. Mover a la gente de la app / CRM a la clase que se queda
            for m in p["mover"]:
                supabase.table("reservas").update({"clase_id": p["_queda"]["id"], "spot_id": m["spot_id"]}).eq("id", m["reserva_id"]).execute()
            # 2. Quitar cada repetida de las plataformas y del CRM
            for c in p["_sobran"]:
                problemas = await _quitar_de_plataformas(client, c)
                supabase.rpc("eliminar_clase", {"p_clase": c["id"], "p_quien": quien,
                    "p_resumen": f"Clase repetida: se juntó con la de {p['se_queda']['coach']} ({len(p['mover'])} reservas movidas)"
                                 + (f". Revisar plataforma: {' · '.join(problemas)}" if problemas else "")}).execute()
                resultado.append({"clase": p["clase"], "horario": p["horario"], "eliminada": c["id"], "problemas": problemas})
            await asyncio.sleep(1)
    try:
        supabase.table("actividad_log").insert({"tipo": "limpiar_duplicados", "tabla": "clases", "accion": "DELETE", "staff_id": staff.get("id"),
            "descripcion": f"{quien} limpió {len(resultado)} clases repetidas", "metadata": {"resultado": resultado}}).execute()
    except Exception:
        pass
    return {"ok": True, "eliminadas": len(resultado), "detalle": resultado}


@router.post("/cancelar-reserva")
async def cancelar_reserva_recepcion(req: dict, request: Request):
    """Recepción cancela la reserva de un cliente que lo pide en sucursal, a cualquier hora y sin penalización.
    Se le regresa su clase (es una cancelación de Navy, no tardía del cliente). Wellhub/TotalPass: desde su app."""
    staff = staff_de_sesion(request, roles=["direccion", "gerente", "staff_navy"])
    rid = req.get("reserva_id")
    if not rid:
        raise HTTPException(status_code=400, detail="reserva_id requerido")
    r = supabase.table("reservas").select(
        "id, estatus, origen, cliente_id, clase_id, clientes(nombre_completo), "
        "clases(nombre_clase, horario, sucursal_id, sucursales(nombre))"
    ).eq("id", rid).limit(1).execute().data
    if not r:
        raise HTTPException(status_code=404, detail="Reserva no encontrada")
    r = r[0]
    if r["estatus"] in ("Cancelada", "Cancelado"):
        return {"ok": True, "ya_estaba": True}
    origen = (r.get("origen") or "").lower()
    if "wellhub" in origen or "totalpass" in origen:
        raise HTTPException(status_code=400, detail=f"Esta reserva es de {r.get('origen')}: el cliente la cancela desde la app de {r.get('origen')}.")

    supabase.table("reservas").update({"estatus": "Cancelada", "clase_consumida": False}).eq("id", rid).execute()

    clase = r.get("clases") or {}
    nombre = (clase.get("nombre_clase") or "").strip()
    quien = f"{staff.get('nombre') or ''} {staff.get('primer_apellido') or ''}".strip() or "Recepción"
    cliente = (r.get("clientes") or {}).get("nombre_completo") or "Cliente"
    try:
        supabase.table("actividad_log").insert({
            "tipo": "reserva_cancelada_recepcion", "tabla": "reservas", "accion": "UPDATE", "staff_id": staff.get("id"),
            "sucursal_id": clase.get("sucursal_id"),
            "descripcion": f"{quien} canceló la reserva de {cliente} en {nombre} ({fmt_fecha(clase['horario'])} {fmt_hora(clase['horario'])}) a petición del cliente",
            "metadata": {"reserva_id": rid, "clase_id": r["clase_id"], "cliente_id": r["cliente_id"], "motivo": req.get("motivo") or "Lo pidió en sucursal"},
        }).execute()
    except Exception as e:
        print("cancelar-reserva actividad:", e)
    try:
        tokens = [t["token"] for t in supabase.table("push_tokens").select("token").eq("cliente_id", r["cliente_id"]).execute().data or []]
        if tokens and clase.get("horario"):
            await enviar_push(tokens, titulo="Reserva cancelada",
                              cuerpo=f"Cancelamos tu reserva de {nombre} del {fmt_fecha(clase['horario'])} a las {fmt_hora(clase['horario'])}, como lo pediste. Tu clase quedó de regreso en tu plan.",
                              data={"tipo": "reserva_cancelada", "clase_id": r["clase_id"]})
    except Exception as e:
        print("cancelar-reserva push:", e)
    return {"ok": True}


@router.post("/eliminar-totalpass")
async def eliminar_clase_totalpass(req: dict):
    occurrence_uuid = req.get("occurrence_uuid")
    sucursal_id     = req.get("sucursal_id")

    if not occurrence_uuid or not sucursal_id:
        raise HTTPException(status_code=400, detail="Faltan parámetros")

    from services.supabase import supabase
    sucursal_res = supabase.table("sucursales")\
        .select("totalpass_place_api_key")\
        .eq("id", sucursal_id).single().execute()
    
    place_api_key = sucursal_res.data.get("totalpass_place_api_key") if sucursal_res.data else None
    if not place_api_key:
        raise HTTPException(status_code=404, detail="No hay TotalPass key para esta sucursal")

    async with httpx.AsyncClient(timeout=15.0) as client:
        auth = await client.post(
            "https://booking-api.totalpass.com/partner/auth",
            json={
                "partner_api_key": os.getenv("TOTALPASS_PARTNER_API_KEY"),
                "place_api_key":   place_api_key,
            }
        )
        token = auth.json().get("token")
        if not token:
            raise HTTPException(status_code=500, detail="Error obteniendo token TotalPass")

        res = await client.delete(
            f"https://booking-api.totalpass.com/partner/event-occurrence/{occurrence_uuid}",
            headers={"Authorization": f"Bearer {token}", "accept": "application/json"},
        )
        print(f"TotalPass eliminar: {res.status_code} {res.text}")

    return {"ok": True, "status": res.status_code}