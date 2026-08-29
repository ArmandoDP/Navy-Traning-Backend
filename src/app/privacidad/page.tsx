export default function PrivacidadPage() {
  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#000',
      fontFamily: 'Arial, sans-serif',
      padding: '60px 20px',
    }}>
      <div style={{ maxWidth: '700px', margin: '0 auto' }}>
        
        <img src="/logo-navy.svg" alt="Navy Training Center" style={{ width: '120px', marginBottom: '40px' }} />
        
        <h1 style={{ color: '#fff', fontSize: '32px', fontWeight: 900, marginBottom: '8px' }}>
          Aviso de Privacidad
        </h1>
        <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '8px' }}>
          Aplicación móvil Navy Training Center (iOS y Android) y CRM asociado
        </p>
        <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '48px' }}>
          Última actualización: 5 de agosto de 2026
        </p>

        {[
          {
            titulo: '1. Responsable del tratamiento',
            texto: 'Navy Training Club Holding (en adelante "Navy Training Center", "Navy" o "nosotros"), con domicilio en Querétaro, Querétaro, México, C.P. 76226, es el responsable del tratamiento de tus datos personales conforme a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP) de México. Contacto de privacidad: contacto@navytrainingcenter.com.'
          },
          {
            titulo: '2. Alcance',
            texto: 'Este aviso aplica a la aplicación móvil Navy Training Center (com.navytrainingcenter.app), disponible en Google Play y App Store, y a los servicios asociados de reservas, membresías y pagos del club.'
          },
          {
            titulo: '3. Datos que recopilamos',
            texto: 'Identificación: Nombre, correo electrónico, teléfono, fotografía de perfil (opcional) — proporcionados al crear tu cuenta.\n\nMembresía y actividad: Paquete contratado, sucursal, reservas de clases, historial de asistencia (check-ins) — generados por tu uso de la app.\n\nPagos: Historial de transacciones, últimos 4 dígitos y vigencia de la tarjeta. Los datos completos de tarjeta los procesa OrkestaPay; nunca se almacenan en nuestros servidores.\n\nComposición corporal (opcional): Mediciones InBody (peso, masa muscular, % grasa), solo si usas ese servicio en el club, con tu consentimiento.\n\nTécnicos: Identificador de dispositivo para notificaciones push, sistema operativo, datos de diagnóstico y uso — automático al usar la app.'
          },
          {
            titulo: '4. Finalidades del tratamiento',
            texto: 'Crear y administrar tu cuenta, membresía y reservas de clases. Procesar pagos, renovaciones y facturación. Enviarte notificaciones sobre tu membresía, clases, pagos y novedades del club (puedes desactivarlas en los ajustes de tu dispositivo o de la app). Registrar tu asistencia y, si lo eliges, tus mediciones de composición corporal. Mejorar la app y atender solicitudes de soporte.\n\nNo vendemos tus datos personales ni los usamos para publicidad de terceros.'
          },
          {
            titulo: '5. Con quién compartimos datos',
            texto: 'Compartimos datos únicamente con proveedores que nos prestan servicios, bajo contrato y solo para las finalidades descritas:\n\nOrkestaPay — Procesamiento de pagos\nGoogle Firebase / FCM y Apple APNs — Notificaciones push\nTotalPass / Fitpass — Validación de accesos por convenios corporativos\nResend — Envío de correos transaccionales\nMicrosoft Azure — Infraestructura y almacenamiento\n\nFuera de estos casos, solo compartiremos datos si una autoridad lo requiere legalmente.'
          },
          {
            titulo: '6. Retención y eliminación de datos',
            texto: 'Conservamos tus datos personales únicamente durante el tiempo necesario:\n\nDatos de cuenta y perfil: Mientras tu cuenta esté activa. Al eliminar tu cuenta, se borran en un máximo de 30 días naturales.\n\nReservas, asistencia y mediciones InBody: Mientras tu cuenta esté activa; se eliminan junto con la cuenta.\n\nHistorial de pagos y comprobantes fiscales: 5 años a partir de la transacción, aun si eliminas tu cuenta (obligación legal fiscal en México).\n\nIdentificadores de notificaciones push: Se eliminan al cerrar sesión, desinstalar la app o eliminar la cuenta.\n\nRegistros técnicos y de diagnóstico: Máximo 12 meses.\n\nCumplidos estos plazos, los datos se eliminan de forma segura o se anonimizan de manera irreversible.'
          },
          {
            titulo: '7. Eliminación de tu cuenta y tus datos',
            texto: 'Puedes solicitar la eliminación de tu cuenta y datos personales en cualquier momento:\n\n• Desde la app: Perfil → Configuración → Eliminar cuenta\n• Por correo: contacto@navytrainingcenter.com desde el correo registrado\n• En línea: www.navytrainingcenter.com/eliminar-cuenta\n\nProcesaremos la solicitud en un máximo de 30 días naturales, con excepción de los datos que debamos conservar por obligación legal.'
          },
          {
            titulo: '8. Seguridad',
            texto: 'Aplicamos medidas técnicas y organizativas para proteger tus datos: cifrado en tránsito (TLS), controles de acceso por rol, infraestructura en Microsoft Azure y monitoreo de accesos. Ningún sistema es infalible, pero trabajamos continuamente para proteger tu información.'
          },
          {
            titulo: '9. Tus derechos (ARCO)',
            texto: 'Conforme a la LFPDPPP, puedes ejercer tus derechos de Acceso, Rectificación, Cancelación y Oposición, así como revocar tu consentimiento o limitar el uso de tus datos, escribiendo a contacto@navytrainingcenter.com. Responderemos en los plazos que marca la ley.'
          },
          {
            titulo: '10. Menores de edad',
            texto: 'La app no está dirigida a menores de 18 años. Los menores solo pueden ser inscritos por su madre, padre o tutor, quien es responsable de la cuenta y otorga el consentimiento correspondiente.'
          },
          {
            titulo: '11. Cambios a este aviso',
            texto: 'Podemos actualizar este aviso. Publicaremos la versión vigente en esta misma URL con su fecha de actualización y, si el cambio es sustancial, te lo notificaremos por la app o por correo.'
          },
        ].map((s, i) => (
          <div key={i} style={{ marginBottom: '32px' }}>
            <h2 style={{ color: '#fff', fontSize: '18px', fontWeight: 700, marginBottom: '12px' }}>
              {s.titulo}
            </h2>
            <p style={{ color: '#9ca3af', fontSize: '15px', lineHeight: '26px', margin: 0, whiteSpace: 'pre-line' }}>
              {s.texto}
            </p>
          </div>
        ))}

        <div style={{ borderTop: '1px solid #1f2937', paddingTop: '32px', marginTop: '48px' }}>
          <p style={{ color: '#4b5563', fontSize: '13px', textAlign: 'center' }}>
            © 2026 Navy Training Center. Todos los derechos reservados.
          </p>
        </div>
      </div>
    </div>
  )
}