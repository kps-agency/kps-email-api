import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

function safe(value) {
  if (value === undefined || value === null || value === '') return '-';
  return value;
}

function boolToOuiNon(value) {
  if (value === true || value === 'oui' || value === 'Oui') return 'Oui';
  if (value === false || value === 'non' || value === 'Non') return 'Non';
  return '-';
}

function escapeHtml(str) {
  if (str === undefined || str === null) return '-';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/\n/g, '<br>');
}

function normalizeAttachments(formData) {
  const attachments = [];

  const logoAttachment = formData?.logoAttachment || null;
  const imageAttachments = Array.isArray(formData?.imageAttachments)
    ? formData.imageAttachments
    : [];

  if (logoAttachment && logoAttachment.content) {
    attachments.push({
      filename: logoAttachment.name || 'logo',
      content: logoAttachment.content,
    });
  }

  for (const image of imageAttachments) {
    if (image && image.content) {
      attachments.push({
        filename: image.name || 'image',
        content: image.content,
      });
    }
  }

  return attachments;
}

function buildUploadedFilesHtml(formData) {
  const files = [];

  if (formData?.logoAttachment?.name) {
    files.push(`Logo : ${escapeHtml(formData.logoAttachment.name)}`);
  }

  if (Array.isArray(formData?.imageAttachments) && formData.imageAttachments.length > 0) {
    for (const image of formData.imageAttachments) {
      if (image?.name) {
        files.push(`Image : ${escapeHtml(image.name)}`);
      }
    }
  }

  if (files.length === 0) return '-';

  return files.map((file) => `<li>${file}</li>`).join('');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('=== RAW req.body ===');
    console.log(JSON.stringify(req.body, null, 2));

    const { formData, clientEmail } = req.body || {};

    if (!formData || !clientEmail) {
      console.error('❌ Données manquantes');
      return res.status(400).json({
        error: 'Missing formData or clientEmail',
      });
    }

    const offre = formData.offre || '';
    const isLandingPage = offre.toLowerCase().includes('landing');
    const isSiteComplet =
      offre.toLowerCase().includes('site internet complet') ||
      offre.toLowerCase().includes('site web complet');

    console.log('=== clientEmail ===', clientEmail);
    console.log('=== offre ===', offre);
    console.log('=== isLandingPage ===', isLandingPage);
    console.log('=== isSiteComplet ===', isSiteComplet);

    const attachments = normalizeAttachments(formData);

    console.log('=== uploadedFiles count ===', [
      formData?.logoAttachment ? 1 : 0,
      ...(Array.isArray(formData?.imageAttachments) ? formData.imageAttachments.map(() => 1) : []),
    ].reduce((a, b) => a + b, 0));

    console.log('=== attachments prepared ===', attachments.length);

    // Infos client
    const nom = safe(formData.nom);
    const email = safe(formData.email);
    const telephone = safe(formData.telephone);
    const entreprise = safe(formData.entreprise);

    // Champs communs
    const deadline = safe(formData.deadline);
    const contraintes = safe(formData.contraintes);
    const confirmation = boolToOuiNon(formData.confirmation);

    // Champs Landing Page
    const objectifLP = safe(formData.objectifLP);
    const offreService = safe(formData.offreService);
    const cibleLP = safe(formData.cibleLP);
    const descLP = safe(formData.descLP);
    const actionAttendue = safe(formData.actionAttendue);

    // Champs Site complet
    const objectifSite = safe(formData.objectifSite);
    const cibleSite = safe(formData.cibleSite);
    const descSite = safe(formData.descSite);
    const pagesSite = safe(formData.pagesSite);
    const hasWebsite = boolToOuiNon(formData.hasWebsite);
    const websiteUrl = safe(formData.websiteUrl);
    const hasDomain = boolToOuiNon(formData.hasDomain);
    const domainName = safe(formData.domainName);
    const hasContent = boolToOuiNon(formData.hasContent);
    const missingElements = safe(formData.missingElements);

    // Ressources / contenu
    const hasTexts = boolToOuiNon(formData.hasTexts);
    const textesFournis = safe(formData.textesFournis);
    const hasLogo = boolToOuiNon(formData.hasLogo);
    const hasImages = boolToOuiNon(formData.hasImages);
    const nombreImages = safe(formData.nombreImages);
    const liensUtiles = safe(formData.liensUtiles);
    const inspirations = safe(formData.inspirations);
    const couleurs = safe(formData.couleurs);

    const uploadedFilesHtml = buildUploadedFilesHtml(formData);

    const projetHtml = isLandingPage
      ? `
        <h3>Projet</h3>
        <p><strong>Offre :</strong> ${escapeHtml(offre)}</p>
        <p><strong>Type d'offre :</strong> Landing Page</p>
        <p><strong>Objectif :</strong> ${escapeHtml(objectifLP)}</p>
        <p><strong>Offre / service mis en avant :</strong> ${escapeHtml(offreService)}</p>
        <p><strong>Cible :</strong> ${escapeHtml(cibleLP)}</p>
        <p><strong>Description :</strong><br>${escapeHtml(descLP)}</p>
        <p><strong>Action attendue du visiteur :</strong> ${escapeHtml(actionAttendue)}</p>
        <p><strong>Pages / sections souhaitées :</strong> -</p>
        <p><strong>Nombre de pages :</strong> -</p>
      `
      : `
        <h3>Projet</h3>
        <p><strong>Offre :</strong> ${escapeHtml(offre)}</p>
        <p><strong>Type d'offre :</strong> Site Internet Complet</p>
        <p><strong>Objectif :</strong> ${escapeHtml(objectifSite)}</p>
        <p><strong>Offre / service mis en avant :</strong> -</p>
        <p><strong>Cible :</strong> ${escapeHtml(cibleSite)}</p>
        <p><strong>Description :</strong><br>${escapeHtml(descSite)}</p>
        <p><strong>Action attendue du visiteur :</strong> -</p>
        <p><strong>Pages / sections souhaitées :</strong><br>${escapeHtml(pagesSite)}</p>
        <p><strong>Nombre de pages :</strong> -</p>
      `;

    const siteDomaineHtml = isLandingPage
      ? `
        <h3>Site existant / domaine</h3>
        <p><strong>Site existant :</strong> -</p>
        <p><strong>URL existante :</strong> -</p>
        <p><strong>Domaine déjà réservé :</strong> ${escapeHtml(hasDomain)}</p>
        <p><strong>Nom de domaine :</strong> ${escapeHtml(domainName)}</p>
      `
      : `
        <h3>Site existant / domaine</h3>
        <p><strong>Site existant :</strong> ${escapeHtml(hasWebsite)}</p>
        <p><strong>URL existante :</strong> ${escapeHtml(websiteUrl)}</p>
        <p><strong>Domaine déjà réservé :</strong> ${escapeHtml(hasDomain)}</p>
        <p><strong>Nom de domaine :</strong> ${escapeHtml(domainName)}</p>
      `;

    const contenuDesignHtml = isLandingPage
      ? `
        <h3>Contenu / design</h3>
        <p><strong>Inspirations :</strong><br>${escapeHtml(inspirations)}</p>
        <p><strong>Couleurs / branding :</strong><br>${escapeHtml(couleurs)}</p>
        <p><strong>Textes déjà prêts :</strong> ${escapeHtml(hasTexts)}</p>
        <p><strong>Textes fournis :</strong><br>${escapeHtml(textesFournis)}</p>
        <p><strong>Logo disponible :</strong> ${escapeHtml(hasLogo)}</p>
        <p><strong>Images / visuels disponibles :</strong> ${escapeHtml(hasImages)}</p>
        <p><strong>Nombre d'images :</strong> ${escapeHtml(nombreImages)}</p>
        <p><strong>Liens utiles :</strong><br>${escapeHtml(liensUtiles)}</p>
      `
      : `
        <h3>Contenu / design</h3>
        <p><strong>Inspirations :</strong><br>${escapeHtml(inspirations)}</p>
        <p><strong>Couleurs / branding :</strong><br>${escapeHtml(couleurs)}</p>
        <p><strong>Contenus déjà prêts :</strong> ${escapeHtml(hasContent)}</p>
        <p><strong>Éléments manquants :</strong><br>${escapeHtml(missingElements)}</p>
        <p><strong>Textes déjà prêts :</strong> ${escapeHtml(hasTexts)}</p>
        <p><strong>Textes fournis :</strong><br>${escapeHtml(textesFournis)}</p>
        <p><strong>Logo disponible :</strong> ${escapeHtml(hasLogo)}</p>
        <p><strong>Images / visuels disponibles :</strong> ${escapeHtml(hasImages)}</p>
        <p><strong>Nombre d'images :</strong> ${escapeHtml(nombreImages)}</p>
        <p><strong>Liens utiles :</strong><br>${escapeHtml(liensUtiles)}</p>
      `;

    const kpsEmailHtml = `
      <div style="font-family: Arial, sans-serif; color: #111; line-height: 1.6;">
        <h2 style="margin-bottom: 16px;">📩 Nouveau Brief Reçu - KPS Agency</h2>

        <p><strong>Email client :</strong> ${escapeHtml(clientEmail)}</p>

        <hr style="margin: 20px 0;" />

        <h3>Informations client</h3>
        <p><strong>Nom :</strong> ${escapeHtml(nom)}</p>
        <p><strong>Email :</strong> ${escapeHtml(email)}</p>
        <p><strong>Téléphone :</strong> ${escapeHtml(telephone)}</p>
        <p><strong>Entreprise :</strong> ${escapeHtml(entreprise)}</p>

        <hr style="margin: 20px 0;" />

        ${projetHtml}

        <hr style="margin: 20px 0;" />

        ${siteDomaineHtml}

        <hr style="margin: 20px 0;" />

        ${contenuDesignHtml}

        <hr style="margin: 20px 0;" />

        <h3>Fichiers uploadés</h3>
        ${uploadedFilesHtml === '-'
          ? `<p>-</p>`
          : `<ul>${uploadedFilesHtml}</ul>`}

        <hr style="margin: 20px 0;" />

        <h3>Contraintes / timing</h3>
        <p><strong>Deadline :</strong> ${escapeHtml(deadline)}</p>
        <p><strong>Contraintes spécifiques :</strong><br>${escapeHtml(contraintes)}</p>

        <hr style="margin: 20px 0;" />

        <p><strong>Confirmation cadre commercial :</strong> ${escapeHtml(confirmation)}</p>
      </div>
    `;

    // Email KPS
    const kpsEmailResult = await resend.emails.send({
      from: 'KPS Agency <contact@kps-agency.com>',
      to: 'kps.agency.ia@gmail.com',
      subject: `Nouveau Brief Reçu - ${offre}`,
      html: kpsEmailHtml,
      attachments,
    });

    console.log('KPS EMAIL RESULT:', kpsEmailResult);

    if (kpsEmailResult.error) {
      console.error('❌ Erreur envoi KPS:', kpsEmailResult.error);
      return res.status(500).json({
        error: 'Failed to send email to KPS',
        details: kpsEmailResult.error,
      });
    }

    // Email client
    const clientEmailHtml = `
      <div style="font-family: Arial, sans-serif; color: #111; line-height: 1.6;">
        <h2>Merci pour votre brief</h2>
        <p>Bonjour ${escapeHtml(nom)},</p>
        <p>
          Nous avons bien reçu votre demande pour l'offre
          <strong>${escapeHtml(offre)}</strong>.
        </p>
        <p>
          Notre équipe va étudier votre brief et revenir vers vous avec les prochaines étapes.
        </p>
        <p>
          Si un acompte ou un lien de paiement doit être envoyé ensuite, nous vous le transmettrons dans le bon cadre.
        </p>
        <p>À bientôt,<br><strong>KPS Agency</strong></p>
      </div>
    `;

    const clientEmailResult = await resend.emails.send({
      from: 'KPS Agency <contact@kps-agency.com>',
      to: clientEmail,
      subject: 'Confirmation de réception de votre brief - KPS Agency',
      html: clientEmailHtml,
    });

    console.log('CLIENT EMAIL RESULT:', clientEmailResult);

    if (clientEmailResult.error) {
      console.error('❌ Erreur envoi client:', clientEmailResult.error);
      return res.status(500).json({
        error: 'Failed to send confirmation email',
        details: clientEmailResult.error,
      });
    }

    console.log('✅ Les deux emails ont été envoyés avec succès');

    return res.status(200).json({
      success: true,
      message: 'Emails sent successfully',
      kpsEmailId: kpsEmailResult.data?.id || null,
      clientEmailId: clientEmailResult.data?.id || null,
      attachmentsCount: attachments.length,
    });
  } catch (error) {
    console.error('❌ Erreur serveur:', error);

    return res.status(500).json({
      error: 'Server error',
      details: error.message,
    });
  }
}
