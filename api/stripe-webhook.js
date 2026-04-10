import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export const config = {
  api: {
    bodyParser: false,
  },
};

async function getRawBody(readable) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

function safe(value) {
  if (value === undefined || value === null || value === '') return '-';
  return String(value).trim();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderFiles(uploadedFiles = []) {
  if (!Array.isArray(uploadedFiles) || uploadedFiles.length === 0) {
    return '<p>Aucun fichier envoyé.</p>';
  }

  return `
    <ul>
      ${uploadedFiles.map((file) => {
        const name = escapeHtml(file?.name || 'Fichier');
        const url = file?.url
          ? `<br><a href="${escapeHtml(file.url)}" target="_blank" rel="noopener noreferrer">Ouvrir le fichier</a>`
          : '';
        return `<li><strong>${name}</strong>${url}</li>`;
      }).join('')}
    </ul>
  `;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method not allowed');
  }

  try {
    const rawBody = await getRawBody(req);
    const signature = req.headers['stripe-signature'];

    const event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );

console.log('WEBHOOK HIT');
console.log('EVENT TYPE:', event.type);
console.log('SESSION ID:', event.data?.object?.id);
console.log('SESSION MODE:', event.data?.object?.mode);
console.log('SESSION CUSTOMER EMAIL:', event.data?.object?.customer_details?.email);
console.log('SESSION METADATA:', event.data?.object?.metadata);
console.log('SESSION PAYMENT LINK:', event.data?.object?.payment_link);
    
    if (event.type !== 'checkout.session.completed') {
      return res.status(200).json({ received: true, ignored: true });
    }

    const session = event.data.object;

    const customerEmail =
      session.customer_details?.email ||
      session.customer_email ||
      null;

    if (!customerEmail) {
      return res.status(400).json({ error: 'No customer email found in Stripe session' });
    }

    const paymentLinkId = session.payment_link || null;

console.log('WEBHOOK SEARCH EMAIL:', customerEmail);
console.log('WEBHOOK SEARCH PAYMENT LINK:', paymentLinkId);
    
const { data: briefs, error: fetchError } = await supabase
  .from('briefs_pending')
  .select('*')
  .eq('client_email', customerEmail)
  .order('created_at', { ascending: false });

   
    if (fetchError) {
      return res.status(500).json({
        error: 'Failed to fetch pending brief',
        details: fetchError.message,
      });
    }

 if (!briefs || briefs.length === 0) {
  console.log('NO BRIEF FOUND FOR EMAIL:', customerEmail);
  return res.status(404).json({
    error: 'No brief found for this email',
  });
}

    let matchedBrief = briefs[0];

console.log('BRIEFS FOUND:', briefs.length);
console.log('FIRST BRIEF ID:', matchedBrief?.id);
console.log('FIRST BRIEF STATUS:', matchedBrief?.status);
console.log('FIRST BRIEF PAYMENT LINK:', matchedBrief?.stripe_payment_url);
    
    if (paymentLinkId) {
      const candidate = briefs.find((brief) =>
        safe(brief.stripe_payment_url).includes(paymentLinkId)
      );
      if (candidate) matchedBrief = candidate;
    }

    const { error: updateError } = await supabase
      .from('briefs_pending')
      .update({
        status: 'paid',
        paid_at: new Date().toISOString(),
        stripe_session_id: session.id,
      })
      .eq('id', matchedBrief.id);

    if (updateError) {
      return res.status(500).json({
        error: 'Failed to update brief after payment',
        details: updateError.message,
      });
    }

    const formData = matchedBrief.form_data || {};
    const uploadedFiles = matchedBrief.files || [];

    const nom = safe(matchedBrief.client_name);
    const clientEmail = safe(matchedBrief.client_email);
    const telephone = safe(matchedBrief.phone);
    const entreprise = safe(matchedBrief.company);
    const offre = safe(matchedBrief.offre);
    const contraintes = safe(
      formData.contraintes ||
      formData.contraintesSpecifiques ||
      formData.specificConstraints
    );

    const projectHtml = `
      <p><strong>Offre :</strong> ${escapeHtml(offre)}</p>
      <p><strong>Contraintes :</strong> ${escapeHtml(contraintes)}</p>
    `;

    const uploadedFilesHtml = renderFiles(uploadedFiles);

const kpsEmailHtml = `
<div style="font-family: Arial, sans-serif; color: #111; line-height: 1.6; background: #f7f7f7; padding: 24px;">
  <div style="max-width: 760px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 16px; overflow: hidden;">
    
    <div style="background: #111827; color: #ffffff; padding: 24px 28px;">
      <h1 style="margin: 0; font-size: 24px;">💳 Paiement confirmé - KPS Agency</h1>
      <p style="margin: 10px 0 0; font-size: 14px; color: #d1d5db;">
        Offre concernée : <strong>${escapeHtml(offre)}</strong>
      </p>
    </div>

    <div style="padding: 28px;">

      <div style="margin-bottom: 28px; padding: 16px 18px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px;">
        <h2 style="margin: 0 0 12px 0; font-size: 18px;">Résumé rapide</h2>
        <p style="margin: 6px 0;"><strong>Email client :</strong> ${escapeHtml(clientEmail)}</p>
        <p style="margin: 6px 0;"><strong>Nom :</strong> ${escapeHtml(nom)}</p>
        <p style="margin: 6px 0;"><strong>Téléphone :</strong> ${escapeHtml(telephone)}</p>
        <p style="margin: 6px 0;"><strong>Entreprise :</strong> ${escapeHtml(entreprise)}</p>
        <p style="margin: 6px 0;"><strong>Session Stripe :</strong> ${escapeHtml(session.id)}</p>
      </div>

      <div style="margin-bottom: 28px;">
        <h2 style="margin: 0 0 14px 0; font-size: 18px; border-bottom: 2px solid #111827; padding-bottom: 8px;">
          Projet
        </h2>
        <div style="padding: 18px; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px;">
          ${projectHtml}
        </div>
      </div>

      <div style="margin-bottom: 28px;">
        <h2 style="margin: 0 0 14px 0; font-size: 18px; border-bottom: 2px solid #111827; padding-bottom: 8px;">
          Fichiers envoyés
        </h2>
        <div style="padding: 18px; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px;">
          ${uploadedFilesHtml}
        </div>
      </div>

    </div>
  </div>
</div>
`;

    const kpsEmailResult = await resend.emails.send({
      from: 'KPS Agency <contact@kps-agency.com>',
      to: 'kps.agency.ia@gmail.com',
      subject: `Paiement confirmé - ${offre}`,
      html: kpsEmailHtml,
    });

    if (kpsEmailResult.error) {
      return res.status(500).json({
        error: 'Failed to send provider email after payment',
        details: kpsEmailResult.error,
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Webhook processed successfully',
    });
  } catch (error) {
    console.error('Stripe webhook error:', error);
    return res.status(400).json({
      error: 'Webhook error',
      details: error.message,
    });
  }
}
