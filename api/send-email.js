import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

function safe(value) {
  if (value === undefined || value === null || value === '') return '-';
  return String(value).trim();
}

function boolToOuiNon(value) {
  if (
    value === true ||
    value === 1 ||
    value === '1' ||
    value === 'true' ||
    value === 'oui' ||
    value === 'Oui' ||
    value === 'yes' ||
    value === 'Yes'
  ) {
    return 'Oui';
  }

  if (
    value === false ||
    value === 0 ||
    value === '0' ||
    value === 'false' ||
    value === 'non' ||
    value === 'Non' ||
    value === 'no' ||
    value === 'No'
  ) {
    return 'Non';
  }

  return '-';
}

function boolToYesNo(value) {
  if (
    value === true ||
    value === 1 ||
    value === '1' ||
    value === 'true' ||
    value === 'oui' ||
    value === 'Oui' ||
    value === 'yes' ||
    value === 'Yes'
  ) {
    return 'Yes';
  }

  if (
    value === false ||
    value === 0 ||
    value === '0' ||
    value === 'false' ||
    value === 'non' ||
    value === 'Non' ||
    value === 'no' ||
    value === 'No'
  ) {
    return 'No';
  }

  return '-';
}

function escapeHtml(value) {
  if (value === undefined || value === null || value === '') return '-';

  return String(value)
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

function isMeaningful(value) {
  if (value === undefined || value === null) return false;
  const str = String(value).trim();
  return str !== '' && str !== '-';
}

/**
 * IMPORTANT
 * On ne joint PAS de gros fichiers dans les emails ici.
 * On liste seulement les fichiers / URLs déjà uploadés côté front (ex: Cloudinary).
 * Cela évite une partie des soucis, mais le front doit lui aussi arrêter
 * d’envoyer des blobs lourds à cette route si tu veux éviter le 413.
 */
function extractUploadedFiles(formData) {
  const files = [];

  const pushFile = (file, label = 'Fichier') => {
    if (!file) return;

    const name =
      file.name ||
      file.filename ||
      file.original_filename ||
      file.originalName ||
      file.public_id ||
      'fichier';

    const url =
      file.url ||
      file.secure_url ||
      file.link ||
      file.href ||
      '';

    const type =
      file.resource_type ||
      file.type ||
      file.mimeType ||
      '';

    files.push({
      label,
      name: String(name),
      url: String(url || ''),
      type: String(type || ''),
    });
  };

  // ===== NOUVEAU FORMAT ENVOYÉ PAR LE FRONT =====

  if (formData?.logoUrl || formData?.logoFileName || formData?.logoPublicId) {
    files.push({
      label: 'Logo',
      name: String(
        formData.logoFileName ||
        formData.logoPublicId ||
        'logo'
      ),
      url: String(formData.logoUrl || ''),
      type: 'image',
    });
  }

  if (Array.isArray(formData?.imageUrls) && formData.imageUrls.length > 0) {
    formData.imageUrls.forEach((url, index) => {
      const fileName =
        Array.isArray(formData?.imageFileNames) && formData.imageFileNames[index]
          ? formData.imageFileNames[index]
          : `image-${index + 1}`;

      files.push({
        label: `Image ${index + 1}`,
        name: String(fileName),
        url: String(url || ''),
        type: 'image',
      });
    });
  }

  // ===== ANCIEN FORMAT / FORMATS DE SECOURS =====

  pushFile(
    formData?.logoAttachment ||
    formData?.logoFile ||
    formData?.logo ||
    formData?.logoCloudinary ||
    null,
    'Logo'
  );

  const imageArrays = [
    formData?.imageAttachments,
    formData?.images,
    formData?.visuals,
    formData?.cloudinaryImages,
    formData?.uploadedImages,
  ];

  for (const arr of imageArrays) {
    if (Array.isArray(arr)) {
      for (const file of arr) {
        pushFile(file, 'Image');
      }
    }
  }

  const genericArrays = [
    formData?.attachments,
    formData?.files,
    formData?.uploadedFiles,
  ];

  for (const arr of genericArrays) {
    if (Array.isArray(arr)) {
      for (const file of arr) {
        pushFile(file, 'Fichier');
      }
    }
  }

  return files;
}

function buildUploadedFilesHtml(files) {
  if (!Array.isArray(files) || files.length === 0) {
    return '<p>-</p>';
  }

  return `
    <ul>
      ${files
        .map((file) => {
          const name = escapeHtml(file.name);
          const label = escapeHtml(file.label || 'Fichier');
          const type = isMeaningful(file.type) ? ` (${escapeHtml(file.type)})` : '';
          const url = isMeaningful(file.url)
            ? `<br><a href="${escapeHtml(file.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(file.url)}</a>`
            : '';
          return `<li><strong>${label} :</strong> ${name}${type}${url}</li>`;
        })
        .join('')}
    </ul>
  `;
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

    // ========= INFOS CLIENT =========
    const nom = safe(pickFirst(formData, ['nom', 'name', 'fullName']));
    const email = safe(pickFirst(formData, ['email']));
    const telephone = safe(pickFirst(formData, ['telephone', 'phone']));
    const entreprise = safe(
      pickFirst(formData, [
        'entreprise',
        'entrepriseActivite',
        'company',
        'activity',
      ])
    );

    const offre = safe(
      pickFirst(formData, ['offre', 'offer', 'selectedOffer'])
    );

    const confirmation = boolToOuiNon(
      pickFirst(formData, ['confirmation', 'commercialTermsConfirmed'])
    );
    const confirmationEn = boolToYesNo(
      pickFirst(formData, ['confirmation', 'commercialTermsConfirmed'])
    );

    const contraintes = safe(
      pickFirst(formData, [
        'contraintes',
        'contraintesSpecifiques',
        'specificConstraints',
      ])
    );

    const isLandingPage = String(offre).toLowerCase().includes('landing');
    const isSiteComplet =
      String(offre).toLowerCase().includes('site internet complet') ||
      String(offre).toLowerCase().includes('site web complet') ||
      String(offre).toLowerCase().includes('complete website');

    // ========= LANDING PAGE =========
    const objectifLP = safe(
      pickFirst(formData, [
        'objectifLP',
        'objectifPrincipal',
        'mainGoalLP',
      ])
    );

    const offreService = safe(
      pickFirst(formData, [
        'offreService',
        'offreServiceMisEnAvant',
        'highlightedOffer',
      ])
    );

    const cibleLP = safe(
      pickFirst(formData, [
        'cibleLP',
        'publicCible',
        'targetAudienceLP',
      ])
    );

    const descLP = safe(
      pickFirst(formData, [
        'descLP',
        'descriptionProjet',
        'projectDescriptionLP',
      ])
    );

    const actionAttendue = safe(
      pickFirst(formData, [
        'actionAttendue',
        'actionAttendueVisiteur',
        'expectedVisitorAction',
      ])
    );

    // ========= SITE COMPLET =========
    const objectifSite = safe(
      pickFirst(formData, [
        'objectifSite',
        'objectifPrincipalSite',
        'mainGoalSite',
      ])
    );

    const cibleSite = safe(
      pickFirst(formData, [
        'cibleSite',
        'publicCibleSite',
        'targetAudienceSite',
      ])
    );

    const descSite = safe(
      pickFirst(formData, [
        'descSite',
        'descriptionProjetSite',
        'projectDescriptionSite',
      ])
    );

    const pagesSite = safe(
      pickFirst(formData, [
        'pagesSite',
        'pagesSectionsSouhaitees',
        'desiredPages',
      ])
    );

    const hasWebsite = boolToOuiNon(
      pickFirst(formData, [
        'hasWebsite',
        'siteExistant',
        'existingWebsite',
      ])
    );
    const hasWebsiteEn = boolToYesNo(
      pickFirst(formData, [
        'hasWebsite',
        'siteExistant',
        'existingWebsite',
      ])
    );

    const websiteUrl = safe(
      pickFirst(formData, [
        'websiteUrl',
        'urlExistante',
        'existingUrl',
      ])
    );

    const hasDomain = boolToOuiNon(
      pickFirst(formData, [
        'hasDomain',
        'domaineReserve',
        'domainAlreadyBooked',
      ])
    );
    const hasDomainEn = boolToYesNo(
      pickFirst(formData, [
        'hasDomain',
        'domaineReserve',
        'domainAlreadyBooked',
      ])
    );

    const domainName = safe(
      pickFirst(formData, [
        'domainName',
        'nomDeDomaine',
        'domain',
      ])
    );

    // ========= RESSOURCES =========
    const hasTexts = boolToOuiNon(
      pickFirst(formData, [
        'hasTexts',
        'textesDejaPrets',
        'textsReady',
      ])
    );
    const hasTextsEn = boolToYesNo(
      pickFirst(formData, [
        'hasTexts',
        'textesDejaPrets',
        'textsReady',
      ])
    );

    const textesFournis = safe(
      pickFirst(formData, [
        'textesFournis',
        'providedTexts',
      ])
    );

    const hasLogo = boolToOuiNon(
      pickFirst(formData, [
        'hasLogo',
        'logoDisponible',
        'logoAvailable',
      ])
    );
    const hasLogoEn = boolToYesNo(
      pickFirst(formData, [
        'hasLogo',
        'logoDisponible',
        'logoAvailable',
      ])
    );

    const hasImages = boolToOuiNon(
      pickFirst(formData, [
        'hasImages',
        'imagesDisponibles',
        'imagesAvailable',
      ])
    );
    const hasImagesEn = boolToYesNo(
      pickFirst(formData, [
        'hasImages',
        'imagesDisponibles',
        'imagesAvailable',
      ])
    );

    const nombreImages = safe(
      pickFirst(formData, [
        'nombreImages',
        'numberOfImages',
      ])
    );

    const liensUtiles = safe(
      pickFirst(formData, [
        'liensUtiles',
        'usefulLinks',
      ])
    );

    const inspirations = safe(
      pickFirst(formData, [
        'inspirations',
        'designInspirations',
      ])
    );

    const couleurs = safe(
      pickFirst(formData, [
        'couleurs',
        'branding',
        'colorsBranding',
      ])
    );

    // Site complet : contenus globaux
    const hasContent = boolToOuiNon(
      pickFirst(formData, [
        'hasContent',
        'contenusDejaPrets',
        'contentReady',
      ])
    );
    const hasContentEn = boolToYesNo(
      pickFirst(formData, [
        'hasContent',
        'contenusDejaPrets',
        'contentReady',
      ])
    );

    const missingElements = safe(
      pickFirst(formData, [
        'missingElements',
        'elementsManquants',
      ])
    );

    // ========= GOOGLE BUSINESS =========
    const hasGoogleBusiness = boolToOuiNon(
      pickFirst(formData, [
        'hasGoogleBusiness',
        'besoinGoogleBusiness',
        'googleBusinessNeeded',
        'googleBusinessSupport',
        'googleBusinessNeededLP',
        'googleBusinessNeededSite',
      ])
    );

    const hasGoogleBusinessEn = boolToYesNo(
      pickFirst(formData, [
        'hasGoogleBusiness',
        'besoinGoogleBusiness',
        'googleBusinessNeeded',
        'googleBusinessSupport',
        'googleBusinessNeededLP',
        'googleBusinessNeededSite',
      ])
    );

    const hasExistingGoogleBusiness = boolToOuiNon(
      pickFirst(formData, [
        'hasExistingGoogleBusiness',
        'ficheGoogleBusinessExistante',
        'existingGoogleBusiness',
        'hasGoogleBusinessProfileLP',
        'hasGoogleBusinessProfileSite',
      ])
    );

    const hasExistingGoogleBusinessEn = boolToYesNo(
      pickFirst(formData, [
        'hasExistingGoogleBusiness',
        'ficheGoogleBusinessExistante',
        'existingGoogleBusiness',
        'hasGoogleBusinessProfileLP',
        'hasGoogleBusinessProfileSite',
      ])
    );

    const createGoogleBusiness = boolToOuiNon(
      pickFirst(formData, [
        'createGoogleBusiness',
        'creationGoogleBusiness',
        'createGoogleBusinessProfile',
        'googleBusinessCreateLP',
        'googleBusinessCreateSite',
      ])
    );

    const createGoogleBusinessEn = boolToYesNo(
      pickFirst(formData, [
        'createGoogleBusiness',
        'creationGoogleBusiness',
        'createGoogleBusinessProfile',
        'googleBusinessCreateLP',
        'googleBusinessCreateSite',
      ])
    );

    const googleBusinessUrl = safe(
      pickFirst(formData, [
        'googleBusinessUrl',
        'lienFicheGoogleBusiness',
        'existingGoogleBusinessUrl',
        'googleBusinessUrlLP',
        'googleBusinessUrlSite',
      ])
    );

    const googleBusinessImprove = safe(
      pickFirst(formData, [
        'googleBusinessImprove',
        'queSouhaitezVousAmeliorer',
        'whatDoYouWantToImprove',
        'googleBusinessImproveLP',
        'googleBusinessImproveSite',
      ])
    );

    const googleBusinessName = safe(
      pickFirst(formData, [
        'googleBusinessName',
        'nomEtablissement',
        'businessName',
        'googleBusinessBusinessNameLP',
        'googleBusinessBusinessNameSite',
      ])
    );

    const googleBusinessAddress = safe(
      pickFirst(formData, [
        'googleBusinessAddress',
        'adresseZoneDesservie',
        'businessAddress',
        'googleBusinessAreaLP',
        'googleBusinessAreaSite',
      ])
    );

    const googleBusinessPhone = safe(
      pickFirst(formData, [
        'googleBusinessPhone',
        'telephoneGoogleBusiness',
        'businessPhone',
        'googleBusinessPhoneLP',
        'googleBusinessPhoneSite',
      ])
    );

    const googleBusinessWebsite = safe(
      pickFirst(formData, [
        'googleBusinessWebsite',
        'siteWebARelier',
        'businessWebsite',
        'googleBusinessWebsiteLP',
        'googleBusinessWebsiteSite',
      ])
    );

    const googleBusinessCategory = safe(
      pickFirst(formData, [
        'googleBusinessCategory',
        'categorieActivite',
        'businessCategory',
        'googleBusinessCategoryLP',
        'googleBusinessCategorySite',
      ])
    );

    const googleBusinessInfos = safe(
      pickFirst(formData, [
        'googleBusinessInfos',
        'informationsImportantesGoogleBusiness',
        'businessImportantInfos',
        'googleBusinessInfoLP',
        'googleBusinessInfoSite',
      ])
    );

    const googleBusinessGoal = safe(
      pickFirst(formData, [
        'googleBusinessGoal',
        'souhaitezVousRelierVotreFuturSite',
        'googleBusinessConnectionGoal',
        'googleBusinessLocalLinkLP',
        'googleBusinessLocalLinkSite',
      ])
    );

    const hasGoogleBusinessDetails =
      hasGoogleBusinessEn === 'Yes' &&
      [
        hasExistingGoogleBusinessEn,
        createGoogleBusinessEn,
        googleBusinessUrl,
        googleBusinessName,
        googleBusinessAddress,
        googleBusinessPhone,
        googleBusinessWebsite,
        googleBusinessCategory,
        googleBusinessInfos,
        googleBusinessImprove,
        googleBusinessGoal,
      ].some(isMeaningful);

    // ========= FICHIERS =========
    const uploadedFiles = extractUploadedFiles(formData);
    const uploadedFilesHtml = buildUploadedFilesHtml(uploadedFiles);

    // ========= BLOCS HTML =========
    const projectHtml = isLandingPage
      ? `
        <h3>Projet</h3>
        <p><strong>Offre :</strong> ${escapeHtml(offre)}</p>
        <p><strong>Type d’offre :</strong> Landing Page</p>
        <p><strong>Objectif principal :</strong> ${escapeHtml(objectifLP)}</p>
        <p><strong>Offre / service mis en avant :</strong> ${escapeHtml(offreService)}</p>
        <p><strong>Public cible :</strong> ${escapeHtml(cibleLP)}</p>
        <p><strong>Description du projet :</strong><br>${escapeHtml(descLP)}</p>
        <p><strong>Action attendue du visiteur :</strong> ${escapeHtml(actionAttendue)}</p>
      `
      : `
        <h3>Projet</h3>
        <p><strong>Offre :</strong> ${escapeHtml(offre)}</p>
        <p><strong>Type d’offre :</strong> Site Internet Complet</p>
        <p><strong>Objectif principal du site :</strong> ${escapeHtml(objectifSite)}</p>
        <p><strong>Public cible :</strong> ${escapeHtml(cibleSite)}</p>
        <p><strong>Description du projet :</strong><br>${escapeHtml(descSite)}</p>
        <p><strong>Pages ou sections souhaitées :</strong><br>${escapeHtml(pagesSite)}</p>
      `;

    const siteDomainHtml = isLandingPage
      ? `
        <h3>Structure / domaine</h3>
        <p><strong>Site existant :</strong> -</p>
        <p><strong>URL du site existant :</strong> -</p>
        <p><strong>Nom de domaine / hébergement :</strong> -</p>
        <p><strong>Nom de domaine :</strong> -</p>
      `
      : `
        <h3>Structure / domaine</h3>
        <p><strong>A déjà un site existant :</strong> ${escapeHtml(hasWebsiteEn)}</p>
        <p><strong>URL du site existant :</strong> ${escapeHtml(websiteUrl)}</p>
        <p><strong>A un nom de domaine / hébergement :</strong> ${escapeHtml(hasDomainEn)}</p>
        <p><strong>Nom de domaine :</strong> ${escapeHtml(domainName)}</p>
      `;

const hasUploadedLogo = uploadedFiles.some(file => file.label === 'Logo');
const hasUploadedImages = uploadedFiles.some(file => file.label === 'Image');

const realHasLogoEn = hasUploadedLogo ? 'Yes' : 'No';
const realHasImagesEn = hasUploadedImages ? 'Yes' : 'No';
    
    const contentDesignHtml = isLandingPage
      ? `
        <h3>Ressources / direction créative</h3>
        <p><strong>Textes déjà prêts :</strong> ${escapeHtml(hasTextsEn)}</p>
        <p><strong>Textes fournis :</strong><br>${escapeHtml(textesFournis)}</p>
        <p><strong>Logo disponible :</strong> ${escapeHtml(realHasLogoEn)}</p>
        <p><strong>Images / visuels disponibles :</strong> ${escapeHtml(realHasImagesEn)}</p>
        <p><strong>Nombre d’images :</strong> ${escapeHtml(nombreImages)}</p>
        <p><strong>Liens utiles :</strong><br>${escapeHtml(liensUtiles)}</p>
        <p><strong>Inspirations design :</strong><br>${escapeHtml(inspirations)}</p>
        <p><strong>Couleurs / branding :</strong><br>${escapeHtml(couleurs)}</p>
      `
      : `
        <h3>Ressources / direction créative</h3>
        <p><strong>Contenus déjà prêts :</strong> ${escapeHtml(hasContentEn)}</p>
        <p><strong>Éléments manquants :</strong><br>${escapeHtml(missingElements)}</p>
        <p><strong>Textes déjà prêts :</strong> ${escapeHtml(hasTextsEn)}</p>
        <p><strong>Textes fournis :</strong><br>${escapeHtml(textesFournis)}</p>
        <p><strong>Logo disponible :</strong> ${escapeHtml(realHasLogoEn)}</p>
        <p><strong>Images / visuels disponibles :</strong> ${escapeHtml(realHasImagesEn)}</p>
        <p><strong>Nombre d’images :</strong> ${escapeHtml(nombreImages)}</p>
        <p><strong>Liens utiles :</strong><br>${escapeHtml(liensUtiles)}</p>
        <p><strong>Inspirations design :</strong><br>${escapeHtml(inspirations)}</p>
        <p><strong>Couleurs / branding :</strong><br>${escapeHtml(couleurs)}</p>
      `;

    const googleBusinessHtml = hasGoogleBusinessDetails
      ? `
        <h3>Google Business</h3>
        <p><strong>Accompagnement Google Business :</strong> ${escapeHtml(hasGoogleBusinessEn)}</p>
        <p><strong>Fiche Google Business existante :</strong> ${escapeHtml(hasExistingGoogleBusinessEn)}</p>
        <p><strong>Créer une nouvelle fiche Google Business :</strong> ${escapeHtml(createGoogleBusinessEn)}</p>
        <p><strong>Lien de la fiche actuelle :</strong><br>${escapeHtml(googleBusinessUrl)}</p>
        <p><strong>Nom de l’établissement affiché :</strong> ${escapeHtml(googleBusinessName)}</p>
        <p><strong>Adresse / zone desservie :</strong> ${escapeHtml(googleBusinessAddress)}</p>
        <p><strong>Téléphone affiché :</strong> ${escapeHtml(googleBusinessPhone)}</p>
        <p><strong>Site web à relier :</strong> ${escapeHtml(googleBusinessWebsite)}</p>
        <p><strong>Catégorie d’activité :</strong> ${escapeHtml(googleBusinessCategory)}</p>
        <p><strong>Informations importantes à afficher :</strong><br>${escapeHtml(googleBusinessInfos)}</p>
        <p><strong>Améliorations souhaitées :</strong><br>${escapeHtml(googleBusinessImprove)}</p>
        <p><strong>Relier le futur site à la présence locale :</strong><br>${escapeHtml(googleBusinessGoal)}</p>
      `
      : `
        <h3>Google Business</h3>
        <p><strong>Accompagnement Google Business :</strong> ${escapeHtml(hasGoogleBusinessEn)}</p>
      `;

  const kpsEmailHtml = `
  <div style="font-family: Arial, sans-serif; color: #111; line-height: 1.6; background: #f7f7f7; padding: 24px;">
    <div style="max-width: 760px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 16px; overflow: hidden;">

      <div style="background: #111827; color: #ffffff; padding: 24px 28px;">
        <h1 style="margin: 0; font-size: 24px;">📩 Nouveau Brief Reçu - KPS Agency</h1>
        <p style="margin: 10px 0 0 0; font-size: 14px; color: #d1d5db;">
          Offre concernée : <strong>${escapeHtml(offre)}</strong>
        </p>
      </div>

      <div style="padding: 28px;">

        <div style="margin-bottom: 28px; padding: 16px 18px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px;">
          <h2 style="margin: 0 0 12px 0; font-size: 18px;">Résumé rapide</h2>
          <p style="margin: 6px 0;"><strong>Email client :</strong> ${escapeHtml(clientEmail)}</p>
          <p style="margin: 6px 0;"><strong>Nom :</strong> ${escapeHtml(nom)}</p>
          <p style="margin: 6px 0;"><strong>Téléphone :</strong> ${escapeHtml(telephone)}</p>
          <p style="margin: 6px 0;"><strong>Entreprise / activité :</strong> ${escapeHtml(entreprise)}</p>
        </div>

        <div style="margin-bottom: 28px;">
          <h2 style="margin: 0 0 14px 0; font-size: 18px; border-bottom: 2px solid #111827; padding-bottom: 8px;">
            1. Informations client
          </h2>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 10px 12px; border: 1px solid #e5e7eb; background: #f9fafb; width: 220px;"><strong>Nom / prénom</strong></td>
              <td style="padding: 10px 12px; border: 1px solid #e5e7eb;">${escapeHtml(nom)}</td>
            </tr>
            <tr>
              <td style="padding: 10px 12px; border: 1px solid #e5e7eb; background: #f9fafb;"><strong>Email</strong></td>
              <td style="padding: 10px 12px; border: 1px solid #e5e7eb;">${escapeHtml(email)}</td>
            </tr>
            <tr>
              <td style="padding: 10px 12px; border: 1px solid #e5e7eb; background: #f9fafb;"><strong>Téléphone</strong></td>
              <td style="padding: 10px 12px; border: 1px solid #e5e7eb;">${escapeHtml(telephone)}</td>
            </tr>
            <tr>
              <td style="padding: 10px 12px; border: 1px solid #e5e7eb; background: #f9fafb;"><strong>Entreprise / activité</strong></td>
              <td style="padding: 10px 12px; border: 1px solid #e5e7eb;">${escapeHtml(entreprise)}</td>
            </tr>
          </table>
        </div>

        <div style="margin-bottom: 28px;">
          <h2 style="margin: 0 0 14px 0; font-size: 18px; border-bottom: 2px solid #111827; padding-bottom: 8px;">
            2. Projet
          </h2>
          <div style="padding: 18px; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px;">
            ${projectHtml}
          </div>
        </div>

        <div style="margin-bottom: 28px;">
          <h2 style="margin: 0 0 14px 0; font-size: 18px; border-bottom: 2px solid #111827; padding-bottom: 8px;">
            3. Structure / domaine
          </h2>
          <div style="padding: 18px; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px;">
            ${siteDomainHtml}
          </div>
        </div>

        <div style="margin-bottom: 28px;">
          <h2 style="margin: 0 0 14px 0; font-size: 18px; border-bottom: 2px solid #111827; padding-bottom: 8px;">
            4. Ressources / direction créative
          </h2>
          <div style="padding: 18px; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px;">
            ${contentDesignHtml}
          </div>
        </div>

        <div style="margin-bottom: 28px;">
          <h2 style="margin: 0 0 14px 0; font-size: 18px; border-bottom: 2px solid #111827; padding-bottom: 8px;">
            5. Google Business
          </h2>
          <div style="padding: 18px; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px;">
            ${googleBusinessHtml}
          </div>
        </div>

        <div style="margin-bottom: 28px;">
          <h2 style="margin: 0 0 14px 0; font-size: 18px; border-bottom: 2px solid #111827; padding-bottom: 8px;">
            6. Fichiers envoyés
          </h2>
          <div style="padding: 18px; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px;">
            ${uploadedFilesHtml}
          </div>
        </div>

        <div style="margin-bottom: 8px;">
          <h2 style="margin: 0 0 14px 0; font-size: 18px; border-bottom: 2px solid #111827; padding-bottom: 8px;">
            7. Cadrage final
          </h2>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 10px 12px; border: 1px solid #e5e7eb; background: #f9fafb; width: 220px;"><strong>Contraintes spécifiques</strong></td>
              <td style="padding: 10px 12px; border: 1px solid #e5e7eb;">${escapeHtml(contraintes)}</td>
            </tr>
            <tr>
              <td style="padding: 10px 12px; border: 1px solid #e5e7eb; background: #f9fafb;"><strong>Cadre commercial confirmé</strong></td>
              <td style="padding: 10px 12px; border: 1px solid #e5e7eb;">${escapeHtml(confirmationEn)}</td>
            </tr>
          </table>
        </div>

      </div>
    </div>
  </div>
`;

    const kpsEmailResult = await resend.emails.send({
      from: 'KPS Agency <contact@kps-agency.com>',
      to: 'kps.agency.ia@gmail.com',
      subject: `Nouveau Brief Reçu - ${offre}`,
      html: kpsEmailHtml,
    });

    if (kpsEmailResult.error) {
      console.error('Erreur envoi mail KPS:', kpsEmailResult.error);
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
          Nous avons bien reçu votre demande pour l’offre
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
      console.error('Erreur envoi mail client:', clientEmailResult.error);
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
      filesCount: uploadedFiles.length,
      note: 'Les gros fichiers doivent idéalement être uploadés sur Cloudinary puis envoyés ici sous forme d’URLs.',
    });
  } catch (error) {
    console.error('Server error:', error);

    return res.status(500).json({
      error: 'Server error',
      details: error.message,
    });
  }
}
