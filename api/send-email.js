import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const DEEPL_API_KEY = process.env.DEEPL_API_KEY || '';
const DEEPL_API_URL =
  process.env.DEEPL_API_URL || 'https://api-free.deepl.com/v2/translate';

function safe(value) {
  if (value === undefined || value === null || value === '') return '-';
  return value;
}

function boolToYesNo(value) {
  if (
    value === true ||
    value === 'oui' ||
    value === 'Oui' ||
    value === 'yes' ||
    value === 'Yes' ||
    value === 'true' ||
    value === 1
  ) {
    return 'Yes';
  }

  if (
    value === false ||
    value === 'non' ||
    value === 'Non' ||
    value === 'no' ||
    value === 'No' ||
    value === 'false' ||
    value === 0
  ) {
    return 'No';
  }

  return '-';
}

function boolToOuiNon(value) {
  if (
    value === true ||
    value === 'oui' ||
    value === 'Oui' ||
    value === 'yes' ||
    value === 'Yes' ||
    value === 'true' ||
    value === 1
  ) {
    return 'Oui';
  }

  if (
    value === false ||
    value === 'non' ||
    value === 'Non' ||
    value === 'no' ||
    value === 'No' ||
    value === 'false' ||
    value === 0
  ) {
    return 'Non';
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

function pickFirst(obj, keys) {
  for (const key of keys) {
    const value = obj?.[key];
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }
  return '';
}

function normalizeAttachments(formData) {
  const attachments = [];

  const logoAttachment =
    formData?.logoAttachment ||
    formData?.logoFile ||
    formData?.logo ||
    null;

  const imageAttachments = Array.isArray(formData?.imageAttachments)
    ? formData.imageAttachments
    : Array.isArray(formData?.images)
      ? formData.images
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

  const logoAttachment =
    formData?.logoAttachment ||
    formData?.logoFile ||
    formData?.logo ||
    null;

  const imageAttachments = Array.isArray(formData?.imageAttachments)
    ? formData.imageAttachments
    : Array.isArray(formData?.images)
      ? formData.images
      : [];

  if (logoAttachment?.name) {
    files.push(`Logo: ${escapeHtml(logoAttachment.name)}`);
  }

  if (imageAttachments.length > 0) {
    for (const image of imageAttachments) {
      if (image?.name) {
        files.push(`Image: ${escapeHtml(image.name)}`);
      }
    }
  }

  if (files.length === 0) return '-';

  return files.map((file) => `<li>${file}</li>`).join('');
}

async function translateTextsToEnglish(textMap) {
  const result = {};
  const entries = Object.entries(textMap).filter(([, value]) => {
    return value !== undefined && value !== null && value !== '' && value !== '-';
  });

  if (entries.length === 0) {
    return { ...textMap };
  }

  if (!DEEPL_API_KEY) {
    return { ...textMap };
  }

  try {
    const response = await fetch(DEEPL_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `DeepL-Auth-Key ${DEEPL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: entries.map(([, value]) => String(value)),
        target_lang: 'EN',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ DeepL HTTP error:', response.status, errorText);
      return { ...textMap };
    }

    const data = await response.json();
    const translations = Array.isArray(data?.translations) ? data.translations : [];

    entries.forEach(([key], index) => {
      result[key] = translations[index]?.text || textMap[key];
    });

    for (const [key, value] of Object.entries(textMap)) {
      if (!(key in result)) {
        result[key] = value;
      }
    }

    return result;
  } catch (error) {
    console.error('❌ DeepL translation error:', error);
    return { ...textMap };
  }
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

    const offre = safe(
      pickFirst(formData, ['offre', 'offer', 'selectedOffer'])
    );

    const isLandingPage = String(offre).toLowerCase().includes('landing');
    const isSiteComplet =
      String(offre).toLowerCase().includes('site internet complet') ||
      String(offre).toLowerCase().includes('site web complet') ||
      String(offre).toLowerCase().includes('complete website');

    const attachments = normalizeAttachments(formData);
    const uploadedFilesHtml = buildUploadedFilesHtml(formData);

    // Infos client
    const nom = safe(pickFirst(formData, ['nom', 'name', 'fullName']));
    const email = safe(pickFirst(formData, ['email']));
    const telephone = safe(pickFirst(formData, ['telephone', 'phone']));
    const entreprise = safe(
      pickFirst(formData, ['entreprise', 'entrepriseActivite', 'company', 'activity'])
    );

    // Champs finaux communs
    const contraintes = safe(
      pickFirst(formData, ['contraintes', 'contraintesSpecifiques', 'specificConstraints'])
    );
    const confirmation = boolToOuiNon(
      pickFirst(formData, ['confirmation', 'commercialTermsConfirmed'])
    );
    const confirmationEn = boolToYesNo(
      pickFirst(formData, ['confirmation', 'commercialTermsConfirmed'])
    );

    // Landing Page
    const objectifLP = safe(
      pickFirst(formData, ['objectifLP', 'objectifPrincipal', 'mainGoalLP'])
    );
    const offreService = safe(
      pickFirst(formData, ['offreService', 'offreServiceMisEnAvant', 'highlightedOffer'])
    );
    const cibleLP = safe(
      pickFirst(formData, ['cibleLP', 'publicCible', 'targetAudienceLP'])
    );
    const descLP = safe(
      pickFirst(formData, ['descLP', 'descriptionProjet', 'projectDescriptionLP'])
    );
    const actionAttendue = safe(
      pickFirst(formData, ['actionAttendue', 'actionAttendueVisiteur', 'expectedVisitorAction'])
    );

    // Site complet
    const objectifSite = safe(
      pickFirst(formData, ['objectifSite', 'objectifPrincipalSite', 'mainGoalSite'])
    );
    const cibleSite = safe(
      pickFirst(formData, ['cibleSite', 'publicCibleSite', 'targetAudienceSite'])
    );
    const descSite = safe(
      pickFirst(formData, ['descSite', 'descriptionProjetSite', 'projectDescriptionSite'])
    );
    const pagesSite = safe(
      pickFirst(formData, ['pagesSite', 'pagesSectionsSouhaitees', 'desiredPages'])
    );
    const hasWebsite = boolToOuiNon(
      pickFirst(formData, ['hasWebsite', 'siteExistant', 'existingWebsite'])
    );
    const hasWebsiteEn = boolToYesNo(
      pickFirst(formData, ['hasWebsite', 'siteExistant', 'existingWebsite'])
    );
    const websiteUrl = safe(
      pickFirst(formData, ['websiteUrl', 'urlExistante', 'existingUrl'])
    );
    const hasDomain = boolToOuiNon(
      pickFirst(formData, ['hasDomain', 'domaineReserve', 'domainAlreadyBooked'])
    );
    const hasDomainEn = boolToYesNo(
      pickFirst(formData, ['hasDomain', 'domaineReserve', 'domainAlreadyBooked'])
    );
    const domainName = safe(
      pickFirst(formData, ['domainName', 'nomDeDomaine', 'domain'])
    );
    const hasContent = boolToOuiNon(
      pickFirst(formData, ['hasContent', 'contenusDejaPrets', 'contentReady'])
    );
    const hasContentEn = boolToYesNo(
      pickFirst(formData, ['hasContent', 'contenusDejaPrets', 'contentReady'])
    );
    const missingElements = safe(
      pickFirst(formData, ['missingElements', 'elementsManquants'])
    );

    // Ressources / contenu
    const hasTexts = boolToOuiNon(
      pickFirst(formData, ['hasTexts', 'textesDejaPrets', 'textsReady'])
    );
    const hasTextsEn = boolToYesNo(
      pickFirst(formData, ['hasTexts', 'textesDejaPrets', 'textsReady'])
    );
    const textesFournis = safe(
      pickFirst(formData, ['textesFournis', 'providedTexts'])
    );
    const hasLogo = boolToOuiNon(
      pickFirst(formData, ['hasLogo', 'logoDisponible', 'logoAvailable'])
    );
    const hasLogoEn = boolToYesNo(
      pickFirst(formData, ['hasLogo', 'logoDisponible', 'logoAvailable'])
    );
    const hasImages = boolToOuiNon(
      pickFirst(formData, ['hasImages', 'imagesDisponibles', 'imagesAvailable'])
    );
    const hasImagesEn = boolToYesNo(
      pickFirst(formData, ['hasImages', 'imagesDisponibles', 'imagesAvailable'])
    );
    const nombreImages = safe(
      pickFirst(formData, ['nombreImages', 'numberOfImages'])
    );
    const liensUtiles = safe(
      pickFirst(formData, ['liensUtiles', 'usefulLinks'])
    );
    const inspirations = safe(
      pickFirst(formData, ['inspirations', 'designInspirations'])
    );
    const couleurs = safe(
      pickFirst(formData, ['couleurs', 'branding', 'colorsBranding'])
    );

    // Google Business
    const hasGoogleBusiness = boolToOuiNon(
      pickFirst(formData, [
        'hasGoogleBusiness',
        'besoinGoogleBusiness',
        'googleBusinessNeeded',
        'googleBusinessSupport',
      ])
    );
    const hasGoogleBusinessEn = boolToYesNo(
      pickFirst(formData, [
        'hasGoogleBusiness',
        'besoinGoogleBusiness',
        'googleBusinessNeeded',
        'googleBusinessSupport',
      ])
    );

    const hasExistingGoogleBusiness = boolToOuiNon(
      pickFirst(formData, [
        'hasExistingGoogleBusiness',
        'ficheGoogleBusinessExistante',
        'existingGoogleBusiness',
      ])
    );
    const hasExistingGoogleBusinessEn = boolToYesNo(
      pickFirst(formData, [
        'hasExistingGoogleBusiness',
        'ficheGoogleBusinessExistante',
        'existingGoogleBusiness',
      ])
    );

    const createGoogleBusiness = boolToOuiNon(
      pickFirst(formData, [
        'createGoogleBusiness',
        'creationGoogleBusiness',
        'createGoogleBusinessProfile',
      ])
    );
    const createGoogleBusinessEn = boolToYesNo(
      pickFirst(formData, [
        'createGoogleBusiness',
        'creationGoogleBusiness',
        'createGoogleBusinessProfile',
      ])
    );

    const googleBusinessUrl = safe(
      pickFirst(formData, [
        'googleBusinessUrl',
        'lienFicheGoogleBusiness',
        'existingGoogleBusinessUrl',
      ])
    );

    const googleBusinessGoal = safe(
      pickFirst(formData, [
        'googleBusinessGoal',
        'souhaitezVousRelierVotreFuturSite',
        'googleBusinessConnectionGoal',
        'whatDoYouWantUsToDo',
        'whatDoYouWantToImprove',
      ])
    );

    const googleBusinessImprove = safe(
      pickFirst(formData, [
        'googleBusinessImprove',
        'queSouhaitezVousAmeliorer',
        'whatDoYouWantToImprove',
      ])
    );

    const googleBusinessName = safe(
      pickFirst(formData, [
        'googleBusinessName',
        'nomEtablissement',
        'businessName',
      ])
    );

    const googleBusinessAddress = safe(
      pickFirst(formData, [
        'googleBusinessAddress',
        'adresseZoneDesservie',
        'businessAddress',
      ])
    );

    const googleBusinessPhone = safe(
      pickFirst(formData, [
        'googleBusinessPhone',
        'telephoneGoogleBusiness',
        'businessPhone',
      ])
    );

    const googleBusinessWebsite = safe(
      pickFirst(formData, [
        'googleBusinessWebsite',
        'siteWebARelier',
        'businessWebsite',
      ])
    );

    const googleBusinessCategory = safe(
      pickFirst(formData, [
        'googleBusinessCategory',
        'categorieActivite',
        'businessCategory',
      ])
    );

    const googleBusinessInfos = safe(
      pickFirst(formData, [
        'googleBusinessInfos',
        'informationsImportantesGoogleBusiness',
        'businessImportantInfos',
      ])
    );

    // Traduction automatique des champs libres pour le mail prestataire
    const translated = await translateTextsToEnglish({
      objectifLP,
      offreService,
      cibleLP,
      descLP,
      actionAttendue,
      objectifSite,
      cibleSite,
      descSite,
      pagesSite,
      websiteUrl,
      domainName,
      missingElements,
      textesFournis,
      liensUtiles,
      inspirations,
      couleurs,
      contraintes,
      googleBusinessUrl,
      googleBusinessGoal,
      googleBusinessImprove,
      googleBusinessName,
      googleBusinessAddress,
      googleBusinessPhone,
      googleBusinessWebsite,
      googleBusinessCategory,
      googleBusinessInfos,
      entreprise,
      nom,
    });

    const projectHtml = isLandingPage
      ? `
        <h3>Project</h3>
        <p><strong>Offer:</strong> ${escapeHtml(offre)}</p>
        <p><strong>Offer type:</strong> Landing Page</p>
        <p><strong>Main goal:</strong> ${escapeHtml(translated.objectifLP)}</p>
        <p><strong>Offer / service highlighted:</strong> ${escapeHtml(translated.offreService)}</p>
        <p><strong>Target audience:</strong> ${escapeHtml(translated.cibleLP)}</p>
        <p><strong>Project description:</strong><br>${escapeHtml(translated.descLP)}</p>
        <p><strong>Expected visitor action:</strong> ${escapeHtml(translated.actionAttendue)}</p>
        <p><strong>Desired pages / sections:</strong> -</p>
        <p><strong>Number of pages:</strong> -</p>
      `
      : `
        <h3>Project</h3>
        <p><strong>Offer:</strong> ${escapeHtml(offre)}</p>
        <p><strong>Offer type:</strong> Complete Website</p>
        <p><strong>Main goal:</strong> ${escapeHtml(translated.objectifSite)}</p>
        <p><strong>Offer / service highlighted:</strong> -</p>
        <p><strong>Target audience:</strong> ${escapeHtml(translated.cibleSite)}</p>
        <p><strong>Project description:</strong><br>${escapeHtml(translated.descSite)}</p>
        <p><strong>Expected visitor action:</strong> -</p>
        <p><strong>Desired pages / sections:</strong><br>${escapeHtml(translated.pagesSite)}</p>
        <p><strong>Number of pages:</strong> -</p>
      `;

    const siteDomainHtml = isLandingPage
      ? `
        <h3>Website / domain</h3>
        <p><strong>Existing website:</strong> -</p>
        <p><strong>Existing URL:</strong> -</p>
        <p><strong>Domain already booked:</strong> ${escapeHtml(hasDomainEn)}</p>
        <p><strong>Domain name:</strong> ${escapeHtml(translated.domainName)}</p>
      `
      : `
        <h3>Website / domain</h3>
        <p><strong>Existing website:</strong> ${escapeHtml(hasWebsiteEn)}</p>
        <p><strong>Existing URL:</strong> ${escapeHtml(translated.websiteUrl)}</p>
        <p><strong>Domain already booked:</strong> ${escapeHtml(hasDomainEn)}</p>
        <p><strong>Domain name:</strong> ${escapeHtml(translated.domainName)}</p>
      `;

    const contentDesignHtml = isLandingPage
      ? `
        <h3>Content / design</h3>
        <p><strong>Design inspirations:</strong><br>${escapeHtml(translated.inspirations)}</p>
        <p><strong>Colors / branding:</strong><br>${escapeHtml(translated.couleurs)}</p>
        <p><strong>Texts already prepared:</strong> ${escapeHtml(hasTextsEn)}</p>
        <p><strong>Texts provided:</strong><br>${escapeHtml(translated.textesFournis)}</p>
        <p><strong>Logo available:</strong> ${escapeHtml(hasLogoEn)}</p>
        <p><strong>Images / visuals available:</strong> ${escapeHtml(hasImagesEn)}</p>
        <p><strong>Number of images:</strong> ${escapeHtml(nombreImages)}</p>
        <p><strong>Useful links:</strong><br>${escapeHtml(translated.liensUtiles)}</p>
      `
      : `
        <h3>Content / design</h3>
        <p><strong>Design inspirations:</strong><br>${escapeHtml(translated.inspirations)}</p>
        <p><strong>Colors / branding:</strong><br>${escapeHtml(translated.couleurs)}</p>
        <p><strong>Content already prepared:</strong> ${escapeHtml(hasContentEn)}</p>
        <p><strong>Missing elements:</strong><br>${escapeHtml(translated.missingElements)}</p>
        <p><strong>Texts already prepared:</strong> ${escapeHtml(hasTextsEn)}</p>
        <p><strong>Texts provided:</strong><br>${escapeHtml(translated.textesFournis)}</p>
        <p><strong>Logo available:</strong> ${escapeHtml(hasLogoEn)}</p>
        <p><strong>Images / visuals available:</strong> ${escapeHtml(hasImagesEn)}</p>
        <p><strong>Number of images:</strong> ${escapeHtml(nombreImages)}</p>
        <p><strong>Useful links:</strong><br>${escapeHtml(translated.liensUtiles)}</p>
      `;

    const googleBusinessHtml =
      hasGoogleBusinessEn === 'Yes'
        ? `
          <h3>Google Business</h3>
          <p><strong>Google Business support needed:</strong> ${escapeHtml(hasGoogleBusinessEn)}</p>
          <p><strong>Existing Google Business profile:</strong> ${escapeHtml(hasExistingGoogleBusinessEn)}</p>
          <p><strong>Create a new Google Business profile:</strong> ${escapeHtml(createGoogleBusinessEn)}</p>
          <p><strong>Current profile link:</strong><br>${escapeHtml(translated.googleBusinessUrl)}</p>
          <p><strong>Business name to use:</strong> ${escapeHtml(translated.googleBusinessName)}</p>
          <p><strong>Address / service area:</strong> ${escapeHtml(translated.googleBusinessAddress)}</p>
          <p><strong>Phone number to display:</strong> ${escapeHtml(translated.googleBusinessPhone)}</p>
          <p><strong>Website to connect:</strong> ${escapeHtml(translated.googleBusinessWebsite)}</p>
          <p><strong>Business category:</strong> ${escapeHtml(translated.googleBusinessCategory)}</p>
          <p><strong>Important information to display:</strong><br>${escapeHtml(translated.googleBusinessInfos)}</p>
          <p><strong>What should we improve / do on it:</strong><br>${escapeHtml(translated.googleBusinessImprove)}</p>
          <p><strong>Local connection goal with the future site:</strong><br>${escapeHtml(translated.googleBusinessGoal)}</p>
        `
        : `
          <h3>Google Business</h3>
          <p><strong>Google Business support needed:</strong> ${escapeHtml(hasGoogleBusinessEn)}</p>
        `;

    const kpsEmailHtml = `
      <div style="font-family: Arial, sans-serif; color: #111; line-height: 1.6;">
        <h2 style="margin-bottom: 16px;">📩 New Brief Received - KPS Agency</h2>

        <p><strong>Client email:</strong> ${escapeHtml(clientEmail)}</p>

        <hr style="margin: 20px 0;" />

        <h3>Client information</h3>
        <p><strong>Full name:</strong> ${escapeHtml(nom)}</p>
        <p><strong>Email:</strong> ${escapeHtml(email)}</p>
        <p><strong>Phone:</strong> ${escapeHtml(telephone)}</p>
        <p><strong>Company / activity:</strong> ${escapeHtml(translated.entreprise)}</p>

        <hr style="margin: 20px 0;" />

        ${projectHtml}

        <hr style="margin: 20px 0;" />

        ${siteDomainHtml}

        <hr style="margin: 20px 0;" />

        ${contentDesignHtml}

        <hr style="margin: 20px 0;" />

        ${googleBusinessHtml}

        <hr style="margin: 20px 0;" />

        <h3>Uploaded files</h3>
        ${
          uploadedFilesHtml === '-'
            ? `<p>-</p>`
            : `<ul>${uploadedFilesHtml}</ul>`
        }

        <hr style="margin: 20px 0;" />

        <h3>Final notes</h3>
        <p><strong>Specific constraints:</strong><br>${escapeHtml(translated.contraintes)}</p>
        <p><strong>Commercial terms confirmed:</strong> ${escapeHtml(confirmationEn)}</p>
      </div>
    `;

    const kpsEmailResult = await resend.emails.send({
      from: 'KPS Agency <contact@kps-agency.com>',
      to: 'kps.agency.ia@gmail.com',
      subject: `New Brief Received - ${offre}`,
      html: kpsEmailHtml,
      attachments,
    });

    if (kpsEmailResult.error) {
      console.error('❌ Error sending KPS email:', kpsEmailResult.error);
      return res.status(500).json({
        error: 'Failed to send email to KPS',
        details: kpsEmailResult.error,
      });
    }

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

    if (clientEmailResult.error) {
      console.error('❌ Error sending client email:', clientEmailResult.error);
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
      translationEnabled: Boolean(DEEPL_API_KEY),
    });
  } catch (error) {
    console.error('❌ Server error:', error);

    return res.status(500).json({
      error: 'Server error',
      details: error.message,
    });
  }
}
