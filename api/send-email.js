import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

function safe(value) {
  if (value === undefined || value === null || value === '') return '-';
  return String(value);
}

function normalizeText(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function boolToYesNo(value) {
  if (
    value === true ||
    value === 'oui' ||
    value === 'Oui' ||
    value === 'yes' ||
    value === 'Yes' ||
    value === 'true'
  ) {
    return 'Yes';
  }

  if (
    value === false ||
    value === 'non' ||
    value === 'Non' ||
    value === 'no' ||
    value === 'No' ||
    value === 'false'
  ) {
    return 'No';
  }

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

function pickFirst(obj, keys = []) {
  for (const key of keys) {
    if (obj && obj[key] !== undefined && obj[key] !== null && obj[key] !== '') {
      return obj[key];
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
    files.push(`Logo: ${escapeHtml(formData.logoAttachment.name)}`);
  }

  if (Array.isArray(formData?.imageAttachments) && formData.imageAttachments.length > 0) {
    for (const image of formData.imageAttachments) {
      if (image?.name) {
        files.push(`Image: ${escapeHtml(image.name)}`);
      }
    }
  }

  if (files.length === 0) return '-';

  return files.map((file) => `<li>${file}</li>`).join('');
}

function section(title, content) {
  return `
    <hr style="margin: 20px 0;" />
    <h3 style="margin: 0 0 12px 0;">${title}</h3>
    ${content}
  `;
}

function row(label, value) {
  return `<p style="margin: 0 0 10px 0;"><strong>${label}</strong> ${value}</p>`;
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
    const { formData, clientEmail } = req.body || {};

    if (!formData || !clientEmail) {
      return res.status(400).json({
        error: 'Missing formData or clientEmail',
      });
    }

    const offre = safe(formData.offre);
    const offreLower = normalizeText(formData.offre).toLowerCase();

    const isLandingPage = offreLower.includes('landing');
    const isSiteComplet =
      offreLower.includes('site internet complet') ||
      offreLower.includes('site web complet') ||
      offreLower.includes('complete website');

    const attachments = normalizeAttachments(formData);
    const uploadedFilesHtml = buildUploadedFilesHtml(formData);

    // Client info
    const nom = safe(formData.nom);
    const email = safe(formData.email);
    const telephone = safe(formData.telephone);
    const entreprise = safe(formData.entreprise);

    // Landing Page fields
    const objectifLP = safe(formData.objectifLP);
    const offreService = safe(formData.offreService);
    const cibleLP = safe(formData.cibleLP);
    const descLP = safe(formData.descLP);
    const actionAttendue = safe(formData.actionAttendue);

    // Website fields
    const objectifSite = safe(formData.objectifSite);
    const cibleSite = safe(formData.cibleSite);
    const descSite = safe(formData.descSite);
    const pagesSite = safe(formData.pagesSite);

    const hasWebsite = boolToYesNo(
      pickFirst(formData, ['hasWebsite', 'siteExistant', 'websiteExists'])
    );
    const websiteUrl = safe(
      pickFirst(formData, ['websiteUrl', 'siteUrl', 'urlExistante'])
    );
    const hasDomain = boolToYesNo(
      pickFirst(formData, ['hasDomain', 'domainReserved', 'domaineReserve'])
    );
    const domainName = safe(
      pickFirst(formData, ['domainName', 'nomDomaine', 'domaineNom'])
    );
    const hasContent = boolToYesNo(
      pickFirst(formData, ['hasContent', 'contenuPret', 'contentReady'])
    );
    const missingElements = safe(
      pickFirst(formData, ['missingElements', 'elementsManquants'])
    );

    // Content / design
    const hasTexts = boolToYesNo(
      pickFirst(formData, ['hasTexts', 'textesPrets'])
    );
    const textesFournis = safe(
      pickFirst(formData, ['textesFournis', 'providedTexts'])
    );
    const hasLogo = boolToYesNo(
      pickFirst(formData, ['hasLogo', 'logoDisponible'])
    );
    const hasImages = boolToYesNo(
      pickFirst(formData, ['hasImages', 'imagesDisponibles'])
    );
    const nombreImages = safe(
      pickFirst(formData, ['nombreImages', 'imageCount'])
    );
    const liensUtiles = safe(
      pickFirst(formData, ['liensUtiles', 'usefulLinks'])
    );
    const inspirations = safe(
      pickFirst(formData, ['inspirations', 'designInspirations'])
    );
    const couleurs = safe(
      pickFirst(formData, ['couleurs', 'brandingColors', 'branding'])
    );

    // Google Business
    const needsGoogleBusiness = boolToYesNo(
      pickFirst(formData, [
        'needsGoogleBusiness',
        'googleBusinessNeeded',
        'googleBusinessSupport',
        'needsGoogleBusinessSupport',
      ])
    );

    const hasGoogleBusiness = boolToYesNo(
      pickFirst(formData, [
        'hasGoogleBusiness',
        'googleBusinessExists',
        'hasExistingGoogleBusiness',
      ])
    );

    const wantsGoogleBusinessCreation = boolToYesNo(
      pickFirst(formData, [
        'wantsGoogleBusinessCreation',
        'createGoogleBusiness',
        'googleBusinessCreation',
      ])
    );

    const googleBusinessUrl = safe(
      pickFirst(formData, [
        'googleBusinessUrl',
        'googleBusinessLink',
        'currentGoogleBusinessUrl',
      ])
    );

    const googleBusinessImprovements = safe(
      pickFirst(formData, [
        'googleBusinessImprovements',
        'googleBusinessNeeds',
        'googleBusinessChanges',
      ])
    );

    const googleBusinessLinkWithSite = safe(
      pickFirst(formData, [
        'googleBusinessLinkWithSite',
        'googleBusinessSiteConnection',
        'linkSiteToGoogleBusiness',
      ])
    );

    const googleBusinessName = safe(
      pickFirst(formData, [
        'googleBusinessName',
        'businessName',
        'etablissementNom',
      ])
    );

    const googleBusinessAddress = safe(
      pickFirst(formData, [
        'googleBusinessAddress',
        'businessAddress',
        'zoneDesservie',
        'adresseZone',
      ])
    );

    const googleBusinessPhone = safe(
      pickFirst(formData, [
        'googleBusinessPhone',
        'businessPhone',
        'telephoneGoogleBusiness',
      ])
    );

    const googleBusinessWebsite = safe(
      pickFirst(formData, [
        'googleBusinessWebsite',
        'businessWebsite',
        'siteWebGoogleBusiness',
      ])
    );

    const googleBusinessCategory = safe(
      pickFirst(formData, [
        'googleBusinessCategory',
        'businessCategory',
        'categorieActivite',
      ])
    );

    const googleBusinessInfos = safe(
      pickFirst(formData, [
        'googleBusinessInfos',
        'businessInfos',
        'infosGoogleBusiness',
      ])
    );

    // Final notes
    const contraintes = safe(formData.contraintes);
    const confirmation = boolToYesNo(formData.confirmation);

    const offerTypeLabel = isLandingPage
      ? 'Landing Page'
      : isSiteComplet
      ? 'Complete Website'
      : offre;

    const projectHtml = isLandingPage
      ? `
        ${row('Selected offer:', escapeHtml(offre))}
        ${row('Offer type:', 'Landing Page')}
        ${row('Main goal:', escapeHtml(objectifLP))}
        ${row('Offer / service highlighted:', escapeHtml(offreService))}
        ${row('Target audience:', escapeHtml(cibleLP))}
        ${row('Project description:<br>', escapeHtml(descLP))}
        ${row('Expected visitor action:', escapeHtml(actionAttendue))}
        ${row('Desired pages / sections:', '-')}
        ${row('Number of pages:', '-')}
      `
      : `
        ${row('Selected offer:', escapeHtml(offre))}
        ${row('Offer type:', 'Complete Website')}
        ${row('Main goal:', escapeHtml(objectifSite))}
        ${row('Offer / service highlighted:', '-')}
        ${row('Target audience:', escapeHtml(cibleSite))}
        ${row('Project description:<br>', escapeHtml(descSite))}
        ${row('Expected visitor action:', '-')}
        ${row('Desired pages / sections:<br>', escapeHtml(pagesSite))}
        ${row('Number of pages:', '-')}
      `;

    const websiteDomainHtml = isLandingPage
      ? `
        ${row('Existing website:', '-')}
        ${row('Existing URL:', '-')}
        ${row('Domain already booked:', escapeHtml(hasDomain))}
        ${row('Domain name:', escapeHtml(domainName))}
      `
      : `
        ${row('Existing website:', escapeHtml(hasWebsite))}
        ${row('Existing URL:', escapeHtml(websiteUrl))}
        ${row('Domain already booked:', escapeHtml(hasDomain))}
        ${row('Domain name:', escapeHtml(domainName))}
      `;

    const contentDesignHtml = isLandingPage
      ? `
        ${row('Design inspirations:<br>', escapeHtml(inspirations))}
        ${row('Colors / branding:<br>', escapeHtml(couleurs))}
        ${row('Texts already prepared:', escapeHtml(hasTexts))}
        ${row('Texts provided:<br>', escapeHtml(textesFournis))}
        ${row('Logo available:', escapeHtml(hasLogo))}
        ${row('Images / visuals available:', escapeHtml(hasImages))}
        ${row('Number of images:', escapeHtml(nombreImages))}
        ${row('Useful links:<br>', escapeHtml(liensUtiles))}
      `
      : `
        ${row('Design inspirations:<br>', escapeHtml(inspirations))}
        ${row('Colors / branding:<br>', escapeHtml(couleurs))}
        ${row('Content already prepared:', escapeHtml(hasContent))}
        ${row('Missing elements:<br>', escapeHtml(missingElements))}
        ${row('Texts already prepared:', escapeHtml(hasTexts))}
        ${row('Texts provided:<br>', escapeHtml(textesFournis))}
        ${row('Logo available:', escapeHtml(hasLogo))}
        ${row('Images / visuals available:', escapeHtml(hasImages))}
        ${row('Number of images:', escapeHtml(nombreImages))}
        ${row('Useful links:<br>', escapeHtml(liensUtiles))}
      `;

    const googleBusinessHtml =
      needsGoogleBusiness === 'Yes'
        ? `
          ${row('Need Google Business support:', 'Yes')}
          ${row('Existing Google Business profile:', escapeHtml(hasGoogleBusiness))}
          ${row('Need profile creation:', escapeHtml(wantsGoogleBusinessCreation))}
          ${
            hasGoogleBusiness === 'Yes'
              ? `
                ${row('Current profile link:', escapeHtml(googleBusinessUrl))}
                ${row('What should we improve:<br>', escapeHtml(googleBusinessImprovements))}
              `
              : ''
          }
          ${
            wantsGoogleBusinessCreation === 'Yes'
              ? `
                ${row('Business name to display:', escapeHtml(googleBusinessName))}
                ${row('Address / service area:', escapeHtml(googleBusinessAddress))}
                ${row('Public phone number:', escapeHtml(googleBusinessPhone))}
                ${row('Website to connect:', escapeHtml(googleBusinessWebsite))}
                ${row('Business category:', escapeHtml(googleBusinessCategory))}
                ${row('Important information to display:<br>', escapeHtml(googleBusinessInfos))}
              `
              : ''
          }
          ${row('Link future website with local presence:<br>', escapeHtml(googleBusinessLinkWithSite))}
        `
        : `
          ${row('Need Google Business support:', 'No')}
        `;

    const uploadedFilesSection =
      uploadedFilesHtml === '-'
        ? `<p style="margin: 0;">-</p>`
        : `<ul style="margin: 0; padding-left: 20px;">${uploadedFilesHtml}</ul>`;

    const finalNotesHtml = `
      ${row('Specific constraints:<br>', escapeHtml(contraintes))}
      ${row('Commercial terms confirmed:', escapeHtml(confirmation))}
    `;

    const kpsEmailHtml = `
      <div style="font-family: Arial, sans-serif; color: #111; line-height: 1.6;">
        <h2 style="margin-bottom: 16px;">📩 New Brief Received - KPS Agency</h2>

        <p style="margin: 0 0 12px 0;"><strong>Client email:</strong> ${escapeHtml(clientEmail)}</p>

        ${section(
          'Client information',
          `
            ${row('Full name:', escapeHtml(nom))}
            ${row('Email:', escapeHtml(email))}
            ${row('Phone:', escapeHtml(telephone))}
            ${row('Company / activity:', escapeHtml(entreprise))}
          `
        )}

        ${section('Project', projectHtml)}

        ${section('Website / domain', websiteDomainHtml)}

        ${section('Content / design', contentDesignHtml)}

        ${section('Google Business Profile', googleBusinessHtml)}

        ${section('Uploaded files', uploadedFilesSection)}

        ${section('Final notes', finalNotesHtml)}
      </div>
    `;

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

    // Prestataire email
    const kpsEmailResult = await resend.emails.send({
      from: 'KPS Agency <contact@kps-agency.com>',
      to: 'kps.agency.ia@gmail.com',
      subject: `New Brief Received - ${offerTypeLabel}`,
      html: kpsEmailHtml,
      attachments,
    });

    if (kpsEmailResult?.error) {
      return res.status(500).json({
        error: 'Failed to send email to KPS',
        details: kpsEmailResult.error,
      });
    }

    // Client email
    const clientEmailResult = await resend.emails.send({
      from: 'KPS Agency <contact@kps-agency.com>',
      to: clientEmail,
      subject: 'Confirmation de réception de votre brief - KPS Agency',
      html: clientEmailHtml,
    });

    if (clientEmailResult?.error) {
      return res.status(500).json({
        error: 'Failed to send confirmation email',
        details: clientEmailResult.error,
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Emails sent successfully',
      kpsEmailId: kpsEmailResult.data?.id || null,
      clientEmailId: clientEmailResult.data?.id || null,
      attachmentsCount: attachments.length,
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Server error',
      details: error.message,
    });
  }
}
