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
      from: 'KPS Agency <contact@kps-agency.com>',
      to: 'kps.agency.ia@gmail.com',
      subject: 'Nouveau Brief Reçu - KPS Agency',
     html: `
  <div style="font-family: Arial, sans-serif; color: #111; line-height: 1.6;">
    <h2 style="margin-bottom: 16px;">📩 Nouveau Brief Reçu — KPS Agency</h2>

    <p><strong>Email client :</strong> ${clientEmail}</p>

    <hr style="margin: 20px 0;" />

    <h3>Informations client</h3>
    <p><strong>Nom :</strong> ${formData.nom || '-'}</p>
    <p><strong>Email :</strong> ${formData.email || '-'}</p>
    <p><strong>Téléphone :</strong> ${formData.telephone || '-'}</p>
    <p><strong>Entreprise :</strong> ${formData.entreprise || '-'}</p>

    <hr style="margin: 20px 0;" />

    <h3>Projet</h3>
    <p><strong>Offre :</strong> ${formData.offre || '-'}</p>
    <p><strong>Objectif :</strong> ${formData.objectif || '-'}</p>
    <p><strong>Cible :</strong> ${formData.cible || '-'}</p>
    <p><strong>Description :</strong><br>${formData.description || '-'}</p>
    <p><strong>Nombre de pages :</strong> ${formData.pages || '-'}</p>

    <hr style="margin: 20px 0;" />

    <h3>Site existant / domaine</h3>
    <p><strong>Site existant :</strong> ${formData.existant || '-'}</p>
    <p><strong>URL existante :</strong> ${formData.urlExistant || '-'}</p>
    <p><strong>Domaine déjà réservé :</strong> ${formData.domaine || '-'}</p>
    <p><strong>Nom de domaine :</strong> ${formData.nomDomaine || '-'}</p>

    <hr style="margin: 20px 0;" />

    <h3>Contenu / design</h3>
    <p><strong>Inspirations :</strong><br>${formData.inspirations || '-'}</p>
    <p><strong>Couleurs / branding :</strong><br>${formData.couleurs || '-'}</p>
    <p><strong>Contenus déjà prêts :</strong> ${formData.contenus || '-'}</p>
    <p><strong>Textes fournis :</strong><br>${formData.textesFournis || '-'}</p>
    <p><strong>Nombre d’images :</strong> ${formData.nombreImages || '-'}</p>

    <hr style="margin: 20px 0;" />

    <h3>Contraintes / timing</h3>
    <p><strong>Deadline :</strong> ${formData.deadline || '-'}</p>
    <p><strong>Contraintes spécifiques :</strong><br>${formData.contraintes || '-'}</p>

    <hr style="margin: 20px 0;" />

    <p><strong>Confirmation cadre commercial :</strong> ${formData.confirmation ? 'Oui' : 'Non'}</p>
  </div>
`
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
      from: 'KPS Agency <contact@kps-agency.com>',
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
