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

function pickFirst(obj, keys) {
  for (const key of keys) {
    const value = obj?.[key];
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }
  return undefined;
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

    console.log(
      '=== uploadedFiles count ===',
      [
        formData?.logoAttachment ? 1 : 0,
        ...(Array.isArray(formData?.imageAttachments) ? formData.imageAttachments.map(() => 1) : []),
      ].reduce((a, b) => a + b, 0)
    );

    console.log('=== attachments prepared ===', attachments.length);

    // Client info
    const nom = safe(formData.nom);
    const email = safe(formData.email);
    const telephone = safe(formData.telephone);
    const entreprise = safe(formData.entreprise);

    // Common
    const contraintes = safe(
      pickFirst(formData, ['contraintes', 'contraintesSpecifiques'])
    );
    const confirmation = boolToOuiNon(formData.confirmation);

    // Landing Page
    const objectifLP = safe(
      pickFirst(formData, ['objectifLP', 'objectifLp'])
    );
    const offreService = safe(
      pickFirst(formData, ['offreService', 'offreMiseEnAvant', 'serviceMiseEnAvant'])
    );
    const cibleLP = safe(
      pickFirst(formData, ['cibleLP', 'cibleLp'])
    );
    const descLP = safe(
      pickFirst(formData, ['descLP', 'descLp', 'descriptionLP', 'descriptionLp'])
    );
    const actionAttendue = safe(
      pickFirst(formData, ['actionAttendue', 'objectifConversion', 'actionVisiteur'])
    );

    // Full website
    const objectifSite = safe(pickFirst(formData, ['objectifSite']));
    const cibleSite = safe(pickFirst(formData, ['cibleSite']));
    const descSite = safe(pickFirst(formData, ['descSite', 'descriptionSite']));
    const pagesSite = safe(
      pickFirst(formData, ['pagesSite', 'sectionsSite', 'pagesSections'])
    );
    const hasWebsite = boolToOuiNon(
      pickFirst(formData, ['hasWebsite', 'siteExistant'])
    );
    const websiteUrl = safe(
      pickFirst(formData, ['websiteUrl', 'urlExistante', 'siteUrl'])
    );
    const hasDomain = boolToOuiNon(
      pickFirst(formData, ['hasDomain', 'domaineReserve'])
    );
    const domainName = safe(
      pickFirst(formData, ['domainName', 'nomDomaine'])
    );
    const hasContent = boolToOuiNon(
      pickFirst(formData, ['hasContent', 'contenusPrets'])
    );
    const missingElements = safe(
      pickFirst(formData, ['missingElements', 'elementsManquants'])
    );

    // Resources / content
    const hasTexts = boolToOuiNon(
      pickFirst(formData, ['hasTexts', 'textesPrets'])
    );
    const textesFournis = safe(pickFirst(formData, ['textesFournis']));
    const hasLogo = boolToOuiNon(
      pickFirst(formData, ['hasLogo', 'logoDisponible'])
    );
    const hasImages = boolToOuiNon(
      pickFirst(formData, ['hasImages', 'visuelsDisponibles'])
    );
    const nombreImages = safe(pickFirst(formData, ['nombreImages']));
    const liensUtiles = safe(pickFirst(formData, ['liensUtiles']));
    const inspirations = safe(pickFirst(formData, ['inspirations']));
    const couleurs = safe(
      pickFirst(formData, ['couleurs', 'branding', 'couleursBranding'])
    );

    // Google Business Profile
    const gbNeeded = boolToOuiNon(
      pickFirst(formData, [
        'googleBusinessNeeded',
        'googleBusinessSupport',
        'besoinGoogleBusiness',
        'hasGoogleBusiness',
      ])
    );

    const gbHasExisting = boolToOuiNon(
      pickFirst(formData, [
        'googleBusinessExisting',
        'hasExistingGoogleBusiness',
        'hasGoogleBusinessProfile',
        'googleBusinessExists',
      ])
    );

    const gbCreateNew = boolToOuiNon(
      pickFirst(formData, [
        'googleBusinessCreate',
        'createGoogleBusiness',
        'createGoogleBusinessProfile',
        'souhaiteCreationGoogleBusiness',
      ])
    );

    const gbProfileUrl = safe(
      pickFirst(formData, [
        'googleBusinessUrl',
        'googleBusinessProfileUrl',
        'lienFicheGoogleBusiness',
        'gbProfileUrl',
      ])
    );

    const gbImproveWhat = safe(
      pickFirst(formData, [
        'googleBusinessImproveWhat',
        'googleBusinessNeeds',
        'ameliorationGoogleBusiness',
        'queSouhaitezVousAmeliorer',
      ])
    );

    const gbBusinessName = safe(
      pickFirst(formData, [
        'googleBusinessBusinessName',
        'gbBusinessName',
        'nomEtablissement',
        'nomEtablissementAffiche',
      ])
    );

    const gbAddress = safe(
      pickFirst(formData, [
        'googleBusinessAddress',
        'gbAddress',
        'adresseZoneDesservie',
        'adresseZoneActivite',
      ])
    );

    const gbPhone = safe(
      pickFirst(formData, [
        'googleBusinessPhone',
        'gbPhone',
        'telephoneGoogleBusiness',
        'telephoneAfficheFiche',
      ])
    );

    const gbWebsite = safe(
      pickFirst(formData, [
        'googleBusinessWebsite',
        'gbWebsite',
        'siteWebARelier',
      ])
    );

    const gbCategory = safe(
      pickFirst(formData, [
        'googleBusinessCategory',
        'gbCategory',
        'categorieActivite',
      ])
    );

    const gbImportantInfo = safe(
      pickFirst(formData, [
        'googleBusinessImportantInfo',
        'gbImportantInfo',
        'informationsImportantes',
        'informationsImportantesAfficher',
      ])
    );

    const gbLinkWithSite = safe(
      pickFirst(formData, [
        'googleBusinessLinkWithSite',
        'gbLinkWithSite',
        'relierSitePresenceLocale',
      ])
    );

    const uploadedFilesHtml = buildUploadedFilesHtml(formData);

    const projectHtml = isLandingPage
      ? `
        <h3 style="margin:0 0 12px 0; font-size:18px; color:#111827;">Project</h3>
        <table style="width:100%; border-collapse:collapse;">
          <tr><td style="padding:8px 0; font-weight:700; width:220px;">Offer</td><td style="padding:8px 0;">${escapeHtml(offre)}</td></tr>
          <tr><td style="padding:8px 0; font-weight:700;">Offer type</td><td style="padding:8px 0;">Landing Page</td></tr>
          <tr><td style="padding:8px 0; font-weight:700;">Main goal</td><td style="padding:8px 0;">${escapeHtml(objectifLP)}</td></tr>
          <tr><td style="padding:8px 0; font-weight:700;">Offer / service highlighted</td><td style="padding:8px 0;">${escapeHtml(offreService)}</td></tr>
          <tr><td style="padding:8px 0; font-weight:700;">Target audience</td><td style="padding:8px 0;">${escapeHtml(cibleLP)}</td></tr>
          <tr><td style="padding:8px 0; font-weight:700;">Project description</td><td style="padding:8px 0;">${escapeHtml(descLP)}</td></tr>
          <tr><td style="padding:8px 0; font-weight:700;">Expected visitor action</td><td style="padding:8px 0;">${escapeHtml(actionAttendue)}</td></tr>
        </table>
      `
      : `
        <h3 style="margin:0 0 12px 0; font-size:18px; color:#111827;">Project</h3>
        <table style="width:100%; border-collapse:collapse;">
          <tr><td style="padding:8px 0; font-weight:700; width:220px;">Offer</td><td style="padding:8px 0;">${escapeHtml(offre)}</td></tr>
          <tr><td style="padding:8px 0; font-weight:700;">Offer type</td><td style="padding:8px 0;">Full Website</td></tr>
          <tr><td style="padding:8px 0; font-weight:700;">Main goal</td><td style="padding:8px 0;">${escapeHtml(objectifSite)}</td></tr>
          <tr><td style="padding:8px 0; font-weight:700;">Target audience</td><td style="padding:8px 0;">${escapeHtml(cibleSite)}</td></tr>
          <tr><td style="padding:8px 0; font-weight:700;">Project description</td><td style="padding:8px 0;">${escapeHtml(descSite)}</td></tr>
          <tr><td style="padding:8px 0; font-weight:700;">Requested pages / sections</td><td style="padding:8px 0;">${escapeHtml(pagesSite)}</td></tr>
        </table>
      `;

    const websiteDomainHtml = isLandingPage
      ? `
        <h3 style="margin:0 0 12px 0; font-size:18px; color:#111827;">Website / domain</h3>
        <table style="width:100%; border-collapse:collapse;">
          <tr><td style="padding:8px 0; font-weight:700; width:220px;">Existing website</td><td style="padding:8px 0;">-</td></tr>
          <tr><td style="padding:8px 0; font-weight:700;">Existing URL</td><td style="padding:8px 0;">-</td></tr>
          <tr><td style="padding:8px 0; font-weight:700;">Domain already booked</td><td style="padding:8px 0;">${escapeHtml(hasDomain)}</td></tr>
          <tr><td style="padding:8px 0; font-weight:700;">Domain name</td><td style="padding:8px 0;">${escapeHtml(domainName)}</td></tr>
        </table>
      `
      : `
        <h3 style="margin:0 0 12px 0; font-size:18px; color:#111827;">Website / domain</h3>
        <table style="width:100%; border-collapse:collapse;">
          <tr><td style="padding:8px 0; font-weight:700; width:220px;">Existing website</td><td style="padding:8px 0;">${escapeHtml(hasWebsite)}</td></tr>
          <tr><td style="padding:8px 0; font-weight:700;">Existing URL</td><td style="padding:8px 0;">${escapeHtml(websiteUrl)}</td></tr>
          <tr><td style="padding:8px 0; font-weight:700;">Domain already booked</td><td style="padding:8px 0;">${escapeHtml(hasDomain)}</td></tr>
          <tr><td style="padding:8px 0; font-weight:700;">Domain name</td><td style="padding:8px 0;">${escapeHtml(domainName)}</td></tr>
        </table>
      `;

    const contentDesignHtml = isLandingPage
      ? `
        <h3 style="margin:0 0 12px 0; font-size:18px; color:#111827;">Content / design</h3>
        <table style="width:100%; border-collapse:collapse;">
          <tr><td style="padding:8px 0; font-weight:700; width:220px;">Design inspirations</td><td style="padding:8px 0;">${escapeHtml(inspirations)}</td></tr>
          <tr><td style="padding:8px 0; font-weight:700;">Colors / branding</td><td style="padding:8px 0;">${escapeHtml(couleurs)}</td></tr>
          <tr><td style="padding:8px 0; font-weight:700;">Texts already prepared</td><td style="padding:8px 0;">${escapeHtml(hasTexts)}</td></tr>
          <tr><td style="padding:8px 0; font-weight:700;">Texts provided</td><td style="padding:8px 0;">${escapeHtml(textesFournis)}</td></tr>
          <tr><td style="padding:8px 0; font-weight:700;">Logo available</td><td style="padding:8px 0;">${escapeHtml(hasLogo)}</td></tr>
          <tr><td style="padding:8px 0; font-weight:700;">Images / visuals available</td><td style="padding:8px 0;">${escapeHtml(hasImages)}</td></tr>
          <tr><td style="padding:8px 0; font-weight:700;">Number of images</td><td style="padding:8px 0;">${escapeHtml(nombreImages)}</td></tr>
          <tr><td style="padding:8px 0; font-weight:700;">Useful links</td><td style="padding:8px 0;">${escapeHtml(liensUtiles)}</td></tr>
        </table>
      `
      : `
        <h3 style="margin:0 0 12px 0; font-size:18px; color:#111827;">Content / design</h3>
        <table style="width:100%; border-collapse:collapse;">
          <tr><td style="padding:8px 0; font-weight:700; width:220px;">Design inspirations</td><td style="padding:8px 0;">${escapeHtml(inspirations)}</td></tr>
          <tr><td style="padding:8px 0; font-weight:700;">Colors / branding</td><td style="padding:8px 0;">${escapeHtml(couleurs)}</td></tr>
          <tr><td style="padding:8px 0; font-weight:700;">Content already prepared</td><td style="padding:8px 0;">${escapeHtml(hasContent)}</td></tr>
          <tr><td style="padding:8px 0; font-weight:700;">Missing elements</td><td style="padding:8px 0;">${escapeHtml(missingElements)}</td></tr>
          <tr><td style="padding:8px 0; font-weight:700;">Texts already prepared</td><td style="padding:8px 0;">${escapeHtml(hasTexts)}</td></tr>
          <tr><td style="padding:8px 0; font-weight:700;">Texts provided</td><td style="padding:8px 0;">${escapeHtml(textesFournis)}</td></tr>
          <tr><td style="padding:8px 0; font-weight:700;">Logo available</td><td style="padding:8px 0;">${escapeHtml(hasLogo)}</td></tr>
          <tr><td style="padding:8px 0; font-weight:700;">Images / visuals available</td><td style="padding:8px 0;">${escapeHtml(hasImages)}</td></tr>
          <tr><td style="padding:8px 0; font-weight:700;">Number of images</td><td style="padding:8px 0;">${escapeHtml(nombreImages)}</td></tr>
          <tr><td style="padding:8px 0; font-weight:700;">Useful links</td><td style="padding:8px 0;">${escapeHtml(liensUtiles)}</td></tr>
        </table>
      `;

    const googleBusinessHtml = gbNeeded === 'Oui'
      ? `
        <h3 style="margin:0 0 12px 0; font-size:18px; color:#111827;">Google Business Profile</h3>
        <table style="width:100%; border-collapse:collapse;">
          <tr><td style="padding:8px 0; font-weight:700; width:220px;">Google Business support needed</td><td style="padding:8px 0;">${escapeHtml(gbNeeded)}</td></tr>
          <tr><td style="padding:8px 0; font-weight:700;">Existing profile</td><td style="padding:8px 0;">${escapeHtml(gbHasExisting)}</td></tr>
          <tr><td style="padding:8px 0; font-weight:700;">Create new profile</td><td style="padding:8px 0;">${escapeHtml(gbCreateNew)}</td></tr>

          ${
            gbHasExisting === 'Oui'
              ? `
                <tr><td style="padding:8px 0; font-weight:700;">Current profile URL</td><td style="padding:8px 0;">${escapeHtml(gbProfileUrl)}</td></tr>
                <tr><td style="padding:8px 0; font-weight:700;">Requested improvements</td><td style="padding:8px 0;">${escapeHtml(gbImproveWhat)}</td></tr>
              `
              : ''
          }

          ${
            gbCreateNew === 'Oui'
              ? `
                <tr><td style="padding:8px 0; font-weight:700;">Business name</td><td style="padding:8px 0;">${escapeHtml(gbBusinessName)}</td></tr>
                <tr><td style="padding:8px 0; font-weight:700;">Address / service area</td><td style="padding:8px 0;">${escapeHtml(gbAddress)}</td></tr>
                <tr><td style="padding:8px 0; font-weight:700;">Public phone</td><td style="padding:8px 0;">${escapeHtml(gbPhone)}</td></tr>
                <tr><td style="padding:8px 0; font-weight:700;">Website to connect</td><td style="padding:8px 0;">${escapeHtml(gbWebsite)}</td></tr>
                <tr><td style="padding:8px 0; font-weight:700;">Business category</td><td style="padding:8px 0;">${escapeHtml(gbCategory)}</td></tr>
                <tr><td style="padding:8px 0; font-weight:700;">Important info to display</td><td style="padding:8px 0;">${escapeHtml(gbImportantInfo)}</td></tr>
              `
              : ''
          }

          <tr><td style="padding:8px 0; font-weight:700;">Connection with website / local presence</td><td style="padding:8px 0;">${escapeHtml(gbLinkWithSite)}</td></tr>
        </table>
      `
      : '';

    const kpsEmailHtml = `
      <div style="margin:0; padding:24px; background:#f3f4f6; font-family:Arial, sans-serif; color:#111827; line-height:1.6;">
        <div style="max-width:900px; margin:0 auto; background:#ffffff; border-radius:16px; overflow:hidden; border:1px solid #e5e7eb;">
          <div style="background:#111827; color:#ffffff; padding:24px 28px;">
            <div style="font-size:12px; letter-spacing:1px; text-transform:uppercase; opacity:.8;">KPS Agency</div>
            <h2 style="margin:8px 0 0 0; font-size:28px;">New Brief Received</h2>
          </div>

          <div style="padding:28px;">
            <div style="margin-bottom:24px; padding:16px 18px; background:#f9fafb; border:1px solid #e5e7eb; border-radius:12px;">
              <p style="margin:0 0 8px 0;"><strong>Client email:</strong> ${escapeHtml(clientEmail)}</p>
              <p style="margin:0;"><strong>Selected offer:</strong> ${escapeHtml(offre)}</p>
            </div>

            <h3 style="margin:0 0 12px 0; font-size:18px; color:#111827;">Client information</h3>
            <table style="width:100%; border-collapse:collapse;">
              <tr><td style="padding:8px 0; font-weight:700; width:220px;">Full name</td><td style="padding:8px 0;">${escapeHtml(nom)}</td></tr>
              <tr><td style="padding:8px 0; font-weight:700;">Email</td><td style="padding:8px 0;">${escapeHtml(email)}</td></tr>
              <tr><td style="padding:8px 0; font-weight:700;">Phone</td><td style="padding:8px 0;">${escapeHtml(telephone)}</td></tr>
              <tr><td style="padding:8px 0; font-weight:700;">Company / activity</td><td style="padding:8px 0;">${escapeHtml(entreprise)}</td></tr>
            </table>

            <hr style="margin:24px 0; border:none; border-top:1px solid #e5e7eb;" />
            ${projectHtml}

            <hr style="margin:24px 0; border:none; border-top:1px solid #e5e7eb;" />
            ${websiteDomainHtml}

            <hr style="margin:24px 0; border:none; border-top:1px solid #e5e7eb;" />
            ${contentDesignHtml}

            ${
              googleBusinessHtml
                ? `<hr style="margin:24px 0; border:none; border-top:1px solid #e5e7eb;" />${googleBusinessHtml}`
                : ''
            }

            <hr style="margin:24px 0; border:none; border-top:1px solid #e5e7eb;" />
            <h3 style="margin:0 0 12px 0; font-size:18px; color:#111827;">Uploaded files</h3>
            ${
              uploadedFilesHtml === '-'
                ? `<p style="margin:0;">No uploaded files.</p>`
                : `<ul style="margin:0; padding-left:18px;">${uploadedFilesHtml}</ul>`
            }

            <hr style="margin:24px 0; border:none; border-top:1px solid #e5e7eb;" />
            <h3 style="margin:0 0 12px 0; font-size:18px; color:#111827;">Final notes</h3>
            <p style="margin:0 0 10px 0;"><strong>Specific constraints:</strong><br>${escapeHtml(contraintes)}</p>
            <p style="margin:0;"><strong>Commercial terms confirmed:</strong> ${escapeHtml(confirmation)}</p>
          </div>
        </div>
      </div>
    `;

    // Email KPS
    const kpsEmailResult = await resend.emails.send({
      from: 'KPS Agency <contact@kps-agency.com>',
      to: 'kps.agency.ia@gmail.com',
      subject: `New Brief Received - ${offre}`,
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
