// app/api/stripe/checkout/founding-member/route.ts
import Stripe from 'stripe';
import { NextResponse } from 'next/server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const CRM_DOMAIN = 'https://crm.navytrainingcenter.com';

const allowedOrigins = [
  'https://www.navytrainingcenter.com',
  'https://navy-training-center.webflow.io',
];

// sucursales válidas para evitar que alguien mande cualquier string por el body
const sucursalesValidas = ['condesa', 'juriquilla'];

function getCorsHeaders(origin: string | null): Record<string, string> {
  if (origin && allowedOrigins.includes(origin)) {
    return { 'Access-Control-Allow-Origin': origin };
  }
  return {};
}

export async function POST(req: Request) {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  if (!process.env.STRIPE_PRICE_FOUNDING_MEMBER) {
    return NextResponse.json(
      { error: 'Configuración incompleta: falta STRIPE_PRICE_FOUNDING_MEMBER' },
      { status: 500, headers: corsHeaders }
    );
  }

  let sucursal: string;
  try {
    const body = await req.json();
    sucursal = body.sucursal;
  } catch {
    return NextResponse.json(
      { error: 'Body inválido' },
      { status: 400, headers: corsHeaders }
    );
  }

  if (!sucursal || !sucursalesValidas.includes(sucursal)) {
    return NextResponse.json(
      { error: 'Sucursal inválida' },
      { status: 400, headers: corsHeaders }
    );
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: process.env.STRIPE_PRICE_FOUNDING_MEMBER, quantity: 1 }],
      success_url: `${CRM_DOMAIN}/gracias?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: origin || 'https://www.navytrainingcenter.com',
      metadata: {
        plan_type: 'founding_member',
        sucursal,
        locked_price: '12000',
        source: 'webflow_landing',
      },
    });

    return NextResponse.json({ url: session.url }, { headers: corsHeaders });
  } catch (err: any) {
    console.error('Error creando checkout session:', err.message);
    return NextResponse.json(
      { error: 'No se pudo iniciar el pago. Intenta de nuevo.' },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function OPTIONS(req: Request) {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  return new NextResponse(null, {
    headers: {
      ...corsHeaders,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}