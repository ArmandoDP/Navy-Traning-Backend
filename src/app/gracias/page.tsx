// app/gracias/page.tsx
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export default async function GraciasPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id: sessionId } = await searchParams;

  if (!sessionId) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-6">
        <p className="text-[#171b24]/60">Sesión no encontrada.</p>
      </div>
    );
  }

  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription', 'customer'],
    });
  } catch (err) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-6 text-center">
        <p className="text-[#171b24]/60 max-w-sm">
          No pudimos verificar tu pago. Si acabas de pagar, revisa tu correo
          para la confirmación, o contáctanos.
        </p>
      </div>
    );
  }

  if (session.payment_status !== 'paid') {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-6 text-center">
        <p className="text-[#171b24]/60 max-w-sm">
          Tu pago aún no se ha confirmado. Si el problema persiste, contáctanos.
        </p>
      </div>
    );
  }

  const subscription = session.subscription as Stripe.Subscription | null;
  const customer = session.customer as Stripe.Customer;
  const nombreCliente = customer?.deleted ? null : customer?.name;

  const nextBilling = subscription?.items?.data?.[0]?.current_period_end
    ? new Date(subscription.items.data[0].current_period_end * 1000).toLocaleDateString('es-MX', {
        day: 'numeric', month: 'long', year: 'numeric',
      })
    : null;

  const beneficios = [
    'Precio garantizado de por vida',
    'Acceso ilimitado a todas las clases',
    'Acceso ilimitado al área de GYM',
    'Acceso a todas las sedes CDMX',
    '20% off en nuestros servicios',
  ];

  return (
    <div className="min-h-screen bg-white text-[#171b24]">
      {/* Fondo con desvanecido azul rey */}
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(23,27,36,0.08),transparent_60%)] pointer-events-none" />

      <div className="relative max-w-lg mx-auto px-6 py-20">
        {/* Logo */}
        <div className="text-center mb-10">
          <span className="text-2xl font-black tracking-tighter text-[#171b24]">NAVY</span>
          <div className="text-[10px] tracking-[0.3em] text-[#171b24]/40 -mt-1">TRAINING</div>
        </div>

        {/* Badge + título */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 bg-[#171b24]/5 border border-[#171b24]/20 text-[#171b24] text-xs font-bold tracking-wide uppercase px-3 py-1 rounded-full mb-6">
            Founding Member confirmado
          </div>
          <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight leading-tight text-[#171b24]">
            Bienvenido a Navy{nombreCliente ? `, ${nombreCliente.split(' ')[0]}` : ''}
          </h1>
          <p className="text-[#171b24]/50 mt-3">
            Tu lugar como Founding Member está asegurado para siempre.
          </p>
        </div>

        {/* Card de detalle */}
        <div className="bg-[#171b24]/[0.04] border border-[#171b24]/10 rounded-2xl p-6 space-y-4 mb-8">
          <div className="flex justify-between items-baseline">
            <span className="text-[#171b24]/40 text-sm uppercase tracking-wide">Plan</span>
            <span className="font-semibold text-right text-[#171b24]">
              Founding Member — {session.metadata?.sucursal}
            </span>
          </div>
          <div className="h-px bg-[#171b24]/10" />
          <div className="flex justify-between items-baseline">
            <span className="text-[#171b24]/40 text-sm uppercase tracking-wide">Precio bloqueado</span>
            <span className="font-semibold text-[#171b24]">
              ${((session.amount_total || 0) / 100).toLocaleString()} MXN
              <span className="text-[#171b24]/40 font-normal"> / 3 meses</span>
            </span>
          </div>
          <div className="h-px bg-[#171b24]/10" />
          <div className="flex justify-between items-baseline">
            <span className="text-[#171b24]/40 text-sm uppercase tracking-wide">Correo</span>
            <span className="font-medium text-[#171b24]/80">{session.customer_details?.email}</span>
          </div>
          {nextBilling && (
            <>
              <div className="h-px bg-[#171b24]/10" />
              <div className="flex justify-between items-baseline">
                <span className="text-[#171b24]/40 text-sm uppercase tracking-wide">Próximo cobro</span>
                <span className="font-medium text-[#171b24]/80">{nextBilling}</span>
              </div>
            </>
          )}
        </div>

        {/* Beneficios */}
        <div className="mb-10">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-[#171b24]/40 mb-4">
            Tus beneficios
          </h2>
          <ul className="space-y-3">
            {beneficios.map((b) => (
              <li key={b} className="flex items-center gap-3 text-sm">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#171b24] text-white flex items-center justify-center text-xs font-bold">
                  ✓
                </span>
                <span className="text-[#171b24]/80">{b}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* CTA volver */}
        <div className="text-center">
          
          <a  href="https://www.navytrainingcenter.com/gym-condesa"
            className="inline-block w-full sm:w-auto bg-[#171b24] text-white font-bold uppercase tracking-wide text-sm px-8 py-4 rounded-lg hover:bg-[#171b24]/90 transition-colors"
          >
            Volver a Navy Condesa
          </a>
        </div>

        <p className="text-xs text-[#171b24]/30 text-center mt-8">
          Revisa tu correo, te enviamos la confirmación y los siguientes pasos.
        </p>
      </div>
    </div>
  );
}