export default function EliminarCuentaPage() {
  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#000',
      fontFamily: 'Arial, sans-serif',
      padding: '60px 20px',
    }}>
      <div style={{ maxWidth: '600px', margin: '0 auto' }}>
        
        <img src="/logo-navy.svg" alt="Navy Training Center" style={{ width: '120px', marginBottom: '40px' }} />
        
        <h1 style={{ color: '#fff', fontSize: '28px', fontWeight: 900, marginBottom: '8px' }}>
          Eliminar cuenta
        </h1>
        <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '40px' }}>
          Navy Training Center
        </p>

        <div style={{ backgroundColor: '#111', borderRadius: '16px', padding: '28px', marginBottom: '24px' }}>
          <h2 style={{ color: '#fff', fontSize: '18px', fontWeight: 700, marginBottom: '16px' }}>
            ¿Cómo solicitar la eliminación de tu cuenta?
          </h2>
          <p style={{ color: '#9ca3af', fontSize: '15px', lineHeight: '26px', marginBottom: '16px' }}>
            Para solicitar la eliminación de tu cuenta y datos asociados, tienes dos opciones:
          </p>
          <ol style={{ color: '#9ca3af', fontSize: '15px', lineHeight: '32px', paddingLeft: '20px' }}>
            <li>Desde la app: ve a <strong style={{ color: '#fff' }}>Perfil → Configuración → Desactivar mi cuenta</strong></li>
            <li>Envía un correo a <a href="mailto:hola@navytrainingcenter.com" style={{ color: '#fff', fontWeight: 700 }}>hola@navytrainingcenter.com</a> con el asunto <strong style={{ color: '#fff' }}>"Eliminar mi cuenta"</strong></li>
          </ol>
        </div>

        <div style={{ backgroundColor: '#111', borderRadius: '16px', padding: '28px', marginBottom: '24px' }}>
          <h2 style={{ color: '#fff', fontSize: '18px', fontWeight: 700, marginBottom: '16px' }}>
            ¿Qué datos se eliminan?
          </h2>
          <ul style={{ color: '#9ca3af', fontSize: '15px', lineHeight: '32px', paddingLeft: '20px' }}>
            <li>Nombre, correo electrónico y número de teléfono</li>
            <li>Historial de reservas y asistencias</li>
            <li>Datos de membresía y preferencias</li>
            <li>Tokens de notificaciones push</li>
          </ul>
        </div>

        <div style={{ backgroundColor: '#111', borderRadius: '16px', padding: '28px', marginBottom: '40px' }}>
          <h2 style={{ color: '#fff', fontSize: '18px', fontWeight: 700, marginBottom: '16px' }}>
            ¿Qué datos se conservan?
          </h2>
          <p style={{ color: '#9ca3af', fontSize: '15px', lineHeight: '26px' }}>
            Los registros de pagos y transacciones se conservan por un período de 5 años por obligaciones fiscales y legales. Estos datos no incluyen información de tarjetas de crédito.
          </p>
        </div>

        <div style={{ borderTop: '1px solid #1f2937', paddingTop: '32px' }}>
          <p style={{ color: '#4b5563', fontSize: '13px', textAlign: 'center' }}>
            © 2026 Navy Training Center · <a href="mailto:hola@navytrainingcenter.com" style={{ color: '#6b7280' }}>hola@navytrainingcenter.com</a>
          </p>
        </div>

      </div>
    </div>
  )
}