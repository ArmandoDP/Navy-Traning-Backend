import os
SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY")

@router.post("/cancelar")
async def cancelar_clase(req: dict):
    clase_id = req.get("clase_id")
    if not clase_id:
        raise HTTPException(status_code=400, detail="clase_id requerido")

    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        # 1. Obtener clase
        r = await client.get(
            f"{SUPABASE_URL}/rest/v1/clases",
            headers=headers,
            params={"id": f"eq.{clase_id}", "select": "id,nombre_clase,horario,duracion_minutos,sucursal_id,sucursales(nombre)"}
        )
        clases_data = r.json()
        if not clases_data:
            raise HTTPException(status_code=404, detail="Clase no encontrada")
        clase = clases_data[0]
        sucursal = (clase.get("sucursales") or {}).get("nombre", "Navy Training Center")

        # 2. Cancelar clase
        await client.patch(
            f"{SUPABASE_URL}/rest/v1/clases",
            headers=headers,
            params={"id": f"eq.{clase_id}"},
            json={"estado": "Cancelada"}
        )

        # 3. Obtener reservas activas
        r2 = await client.get(
            f"{SUPABASE_URL}/rest/v1/reservas",
            headers=headers,
            params={"clase_id": f"eq.{clase_id}", "estatus": "neq.Cancelada", "select": "id,cliente_id,clientes(nombre_completo,email,push_tokens(token))"}
        )
        reservas = r2.json() or []

        # 4. Cancelar reservas
        if reservas:
            ids = [r["id"] for r in reservas]
            for rid in ids:
                await client.patch(
                    f"{SUPABASE_URL}/rest/v1/reservas",
                    headers=headers,
                    params={"id": f"eq.{rid}"},
                    json={"estatus": "Cancelada", "metadata": {"motivo": "clase_cancelada"}}
                )

    # 5. Push + correo
    for r in reservas:
        cliente = r.get("clientes") or {}
        nombre  = cliente.get("nombre_completo", "")
        email   = cliente.get("email", "")
        tokens  = [pt["token"] for pt in (cliente.get("push_tokens") or [])]
        hora    = fmt_hora(clase["horario"])
        fecha   = fmt_fecha(clase["horario"])

        if tokens:
            await enviar_push(
                tokens,
                titulo=f"❌ Clase cancelada — {clase['nombre_clase']}",
                cuerpo=f"Tu clase del {fecha} a las {hora} en {sucursal} fue cancelada. Puedes reservar otra clase.",
                data={"tipo": "clase_cancelada", "clase_id": clase_id}
            )
        if email:
            try:
                await enviar_correo_cancelacion(email, nombre, clase, sucursal)
            except Exception as e:
                print(f"Error correo cancelación {email}:", e)

    return {"ok": True, "clase_cancelada": clase_id, "reservas_canceladas": len(reservas)}