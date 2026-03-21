import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Préflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { formData, clientEmail } = req.body;

    if (!formData || !clientEmail) {
      return res.status(400).json({ error: 'Missing formData or clientEmail' });
    }

    await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: 'kps.agency.ia@gmail.com',
      subject: 'Nouveau Brief - KPS Agency',
      html: `<h2>Nouveau Brief Reçu</h2><pre>${JSON.stringify(formData, null, 2)}</pre>`,
    });

    await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: clientEmail,
      subject: 'Confirmation de votre brief',
      html: `<p>Bonjour, nous avons bien reçu votre brief. Nous reviendrons vers vous rapidement avec la suite. - KPS Agency</p>`,
    });

    return res.status(200).json({
      success: true,
      message: 'Emails sent successfully'
    });
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
