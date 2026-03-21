import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { formData, clientEmail } = req.body;

    console.log('📨 Données reçues:', JSON.stringify(formData, null, 2));
    console.log('📧 Email client:', clientEmail);

    // Validation
    if (!formData || !clientEmail) {
      console.error('❌ Données manquantes');
      return res.status(400).json({ error: 'Missing formData or clientEmail' });
    }

    // Email 1 : Envoyer le brief à KPS
    console.log('📤 Envoi email à KPS...');
    const kpsEmailResult = await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: 'kps.agency.ia@gmail.com',
      subject: 'Nouveau Brief Reçu - KPS Agency',
      html: `
        <h2>Nouveau Brief Reçu</h2>
        <p><strong>Email client:</strong> ${clientEmail}</p>
        <hr />
        <h3>Détails du Brief:</h3>
        <pre>${JSON.stringify(formData, null, 2)}</pre>
      `
    });

    console.log('✅ Résultat email KPS:', kpsEmailResult);

    if (kpsEmailResult.error) {
      console.error('❌ Erreur envoi KPS:', kpsEmailResult.error);
      return res.status(500).json({ error: 'Failed to send email to KPS', details: kpsEmailResult.error });
    }

    // Email 2 : Confirmation au client
    console.log('📤 Envoi confirmation au client...');
    const clientEmailResult = await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: clientEmail,
      subject: 'Confirmation de votre brief - KPS Agency',
      html: `
        <h2>Merci pour votre brief!</h2>
        <p>Bonjour,</p>
        <p>Nous avons bien reçu votre brief. Notre équipe l'examinera rapidement et nous reviendrons vers vous avec les prochaines étapes.</p>
        <p>À bientôt!</p>
        <p><strong>KPS Agency</strong></p>
      `
    });

    console.log('✅ Résultat email client:', clientEmailResult);

    if (clientEmailResult.error) {
      console.error('❌ Erreur envoi client:', clientEmailResult.error);
      return res.status(500).json({ error: 'Failed to send confirmation email', details: clientEmailResult.error });
    }

    // Succès complet
    console.log('✅ Les deux emails ont été envoyés avec succès!');
    return res.status(200).json({ 
      success: true, 
      message: 'Emails sent successfully',
      kpsEmailId: kpsEmailResult.id,
      clientEmailId: clientEmailResult.id
    });

  } catch (error) {
    console.error('❌ Erreur serveur:', error);
    return res.status(500).json({ 
      error: 'Server error', 
      details: error.message 
    });
  }
}
