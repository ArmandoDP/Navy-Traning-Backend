export default function PagoCancelado() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: '#171B24' }}>
      <div style={{ textAlign: 'center', color: '#fff' }}>
        <p style={{ fontSize: 48, marginBottom: 16 }}>✕</p>
        <p style={{ fontSize: 24, fontWeight: 900 }}>Pago cancelado</p>
        <p style={{ color: '#9ca3af', marginTop: 8 }}>Puedes intentarlo de nuevo.</p>
      </div>
    </div>
  )
}