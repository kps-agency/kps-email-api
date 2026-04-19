import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';

const resend = new Resend(process.env.RESEND_API_KEY);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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

async function uploadFilesToStorage(files = [], briefId = 'brief') {
  const uploaded = [];

  for (const file of files) {
    try {
      if (!file?.base64 || !file?.name) continue;

      const cleanName = String(file.name).replace(/[^\w.\-]/g, '_');
      const filePath = `${briefId}/${Date.now()}-${cleanName}`;

      const base64Data = file.base64.includes(',')
        ? file.base64.split(',')[1]
        : file.base64;

      const buffer = Buffer.from(base64Data, 'base64');

      const { error: uploadError } = await supabase.storage
        .from('brief-files')
        .upload(filePath, buffer, {
          contentType: file.type || 'application/octet-stream',
          upsert: false,
        });

      if (uploadError) {
        console.error('Erreur upload storage :', uploadError);
        continue;
      }

      const { data: publicUrlData } = supabase.storage
        .from('brief-files')
        .getPublicUrl(filePath);

      uploaded.push({
        name: file.name,
        label: file.label || 'Fichier',
        path: filePath,
        url: publicUrlData?.publicUrl || null,
        type: file.type || null,
      });
    } catch (err) {
      console.error('Erreur traitement fichier :', err);
    }
  }

  return uploaded;
}

function buildUploadedFilesLinksHtml(files = []) {
  if (!files.length) {
    return '<p style="margin:0;">Aucun fichier réellement envoyé.</p>';
  }

  return files
    .map((file) => {
      const safeLabel = escapeHtml(file.label || 'Fichier');
      const safeName = escapeHtml(file.name || 'Sans nom');
      const safeUrl = file.url || '#';

      return `
        <p style="margin:8px 0;">
          <strong>${safeLabel} :</strong>
          <a href="${safeUrl}" target="_blank" style="color:#4ea1ff; text-decoration:underline;">
            ${safeName}
          </a>
        </p>
      `;
    })
    .join('');
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
const formatList = (value) => {
  if (Array.isArray(value)) return value.filter(Boolean).join(', ');
  if (value === undefined || value === null || value === '') return '';
  return String(value).trim();
};

const formType = safe(req.body?.formType || '');
const packType = safe(pickFirst(formData, ['packType']));
const details = safe(pickFirst(formData, ['details']));
const socialOfferRaw = safe(pickFirst(formData, ['offre', 'offer', 'selectedOffer']));

const isSocialMedia =
  String(formType).toLowerCase().includes('social media') ||
  String(formType).toLowerCase().includes('social/médias') ||
  String(formType).toLowerCase().includes('social medias') ||
  String(socialOfferRaw).toLowerCase().includes('pack standard') ||
  String(socialOfferRaw).toLowerCase().includes('pack complet');

const objectifSM = safe(pickFirst(formData, ['objectif']));
const presentationSM = safe(pickFirst(formData, ['presentation']));
const propositionSM = safe(pickFirst(formData, ['proposition']));
const pourquoiChoisirSM = safe(pickFirst(formData, ['pourquoiChoisir']));
const clientIdealSM = safe(pickFirst(formData, ['clientIdeal']));
const typeCibleSM = safe(pickFirst(formData, ['typeCible']));
const zoneGeoSM = safe(pickFirst(formData, ['zoneGeo']));
const reseauxSM = formatList(formData.reseaux);

const lienInstagramSM = safe(pickFirst(formData, ['lienInstagram']));
const lienFacebookSM = safe(pickFirst(formData, ['lienFacebook']));
const lienLinkedInSM = safe(pickFirst(formData, ['lienLinkedIn']));
const lienTikTokSM = safe(pickFirst(formData, ['lienTikTok']));

const charteGraphiqueSM = safe(pickFirst(formData, ['charteGraphique']));
const lienCharteSM = safe(pickFirst(formData, ['lienCharte']));
const logoDispoSM = safe(pickFirst(formData, ['logoDispo']));
const lienLogoSM = safe(pickFirst(formData, ['lienLogo']));
const couleursSM = safe(pickFirst(formData, ['couleurs']));
const tonSM = safe(pickFirst(formData, ['ton']));

const productionDispoSM = formatList(formData.productionDispo);
const lienVideosSM = safe(pickFirst(formData, ['lienVideos']));
const lienPhotosSM = safe(pickFirst(formData, ['lienPhotos']));
const temoignagesTexteSM = safe(pickFirst(formData, ['temoignagesTexte']));
const lienTemoignagesSM = safe(pickFirst(formData, ['lienTemoignages']));
const produitsAFilmerSM = safe(pickFirst(formData, ['produitsAFilmer']));
const lieuTournageSM = safe(pickFirst(formData, ['lieuTournage']));
const contraintesLieuSM = safe(pickFirst(formData, ['contraintesLieu']));
const creationContenuDispoSM = safe(pickFirst(formData, ['creationContenuDispo']));
const disponibiliteRythmeSM = safe(pickFirst(formData, ['disponibiliteRythme']));
const disponibilitePeriodesSM = safe(pickFirst(formData, ['disponibilitePeriodes']));

const thematiquesSM = safe(pickFirst(formData, ['thematiques']));
const sujetsEviterSM = safe(pickFirst(formData, ['sujetsEviter']));
const inspirationsSM = safe(pickFirst(formData, ['inspirations']));

const cmSouhaitsSM = formatList(formData.cmSouhaits);
const cmFrequenceSM = safe(pickFirst(formData, ['cmFrequence']));
const cmAccesInfosSM = safe(pickFirst(formData, ['cmAccesInfos']));

const nombreAbonnesSM = safe(pickFirst(formData, ['nombreAbonnes']));
const engagementAttenduSM = safe(pickFirst(formData, ['engagementAttendu']));
const leadGenSM = safe(pickFirst(formData, ['leadGen']));

const accesSM = formatList(formData.acces);
const accesLienInstagramSM = safe(pickFirst(formData, ['accesLienInstagram']));
const accesLienFacebookSM = safe(pickFirst(formData, ['accesLienFacebook']));
const accesLienLinkedInSM = safe(pickFirst(formData, ['accesLienLinkedIn']));
const accesLienTikTokSM = safe(pickFirst(formData, ['accesLienTikTok']));
const outilsSM = safe(pickFirst(formData, ['outils']));

const dateDemarrageSM = safe(pickFirst(formData, ['dateDemarrage']));
const prefCommunicationSM = safe(pickFirst(formData, ['prefCommunication']));

const confirmation1SM = formData.confirmation1 ? 'Oui' : 'Non';
const confirmation2SM = formData.confirmation2 ? 'Oui' : 'Non';

const fichiersSelectionnesSM =
  formData?.fichiersSelectionnes && typeof formData.fichiersSelectionnes === 'object'
    ? formData.fichiersSelectionnes
    : null;

const fichiersSelectionnesHtmlSM =
  fichiersSelectionnesSM && Object.keys(fichiersSelectionnesSM).length > 0
    ? Object.entries(fichiersSelectionnesSM)
        .filter(([, value]) => value)
        .map(
          ([label, value]) =>
            `<p style="margin:6px 0;"><strong>${escapeHtml(label)} :</strong> ${escapeHtml(String(value))}</p>`
        )
        .join('')
    : '<p style="margin:0;">Aucun nom de fichier transmis.</p>';

    
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
const rawUploadedFiles = extractUploadedFiles(formData);
const briefStorageId = `brief-${Date.now()}`;

const uploadedFiles = await uploadFilesToStorage(
  rawUploadedFiles,
  briefStorageId
);

const uploadedFilesHtml = buildUploadedFilesLinksHtml(uploadedFiles);

    const { data: pendingBrief, error: insertError } = await supabase
  .from('briefs_pending')
  .insert([
    {
      offre: offre,
      client_email: clientEmail,
      client_name: nom,
      company: entreprise,
      phone: telephone,
      form_data: formData,
      files: uploadedFiles
    }
  ])
  .select()
  .single();

if (insertError) {
  console.error('Erreur insertion Supabase :', insertError);
  return res.status(500).json({
    error: 'Failed to save brief in database',
    details: insertError.message
  });
}
    const socialMediaKpsEmailHtml = `
  <div style="font-family: Arial, sans-serif; color: #111; line-height: 1.6; background: #f7f7f7; padding: 24px;">
    <div style="max-width: 760px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 16px; overflow: hidden;">
      <div style="background: #111827; color: #ffffff; padding: 24px 28px;">
        <h1 style="margin: 0; font-size: 24px;">📩 Nouveau Brief Social/Médias - KPS Agency</h1>
        <p style="margin: 10px 0 0 0; font-size: 14px; color: #d1d5db;">
          Offre concernée : <strong>${escapeHtml(socialOfferRaw || offre || 'Non précisée')}</strong>
        </p>
      </div>

      <div style="padding: 28px;">
        <div style="margin-bottom: 24px; padding: 16px 18px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px;">
          <h2 style="margin: 0 0 12px 0; font-size: 18px;">Résumé rapide</h2>
          <p style="margin: 6px 0;"><strong>Pack :</strong> ${escapeHtml(packType || 'Non précisé')}</p>
          <p style="margin: 6px 0;"><strong>Détails de l’offre :</strong> ${escapeHtml(details || 'Non précisés')}</p>
          <p style="margin: 6px 0;"><strong>Email client :</strong> ${escapeHtml(clientEmail || 'Non précisé')}</p>
          <p style="margin: 6px 0;"><strong>Nom :</strong> ${escapeHtml(nom || 'Non précisé')}</p>
          <p style="margin: 6px 0;"><strong>Téléphone :</strong> ${escapeHtml(telephone || 'Non précisé')}</p>
          <p style="margin: 6px 0;"><strong>Entreprise :</strong> ${escapeHtml(entreprise || 'Non précisée')}</p>
        </div>

        <div style="margin-bottom: 28px;">
          <h2 style="margin: 0 0 14px 0; font-size: 18px; border-bottom: 2px solid #111827; padding-bottom: 8px;">
            1. Informations générales
          </h2>
          <table style="width:100%; border-collapse: collapse;">
            <tr><td style="padding:10px 12px; border:1px solid #e5e7eb; background:#f9fafb; width:220px;"><strong>Entreprise</strong></td><td style="padding:10px 12px; border:1px solid #e5e7eb;">${escapeHtml(entreprise)}</td></tr>
            <tr><td style="padding:10px 12px; border:1px solid #e5e7eb; background:#f9fafb;"><strong>Site web</strong></td><td style="padding:10px 12px; border:1px solid #e5e7eb;">${escapeHtml(safe(pickFirst(formData, ['siteWeb'])))}</td></tr>
            <tr><td style="padding:10px 12px; border:1px solid #e5e7eb; background:#f9fafb;"><strong>Secteur</strong></td><td style="padding:10px 12px; border:1px solid #e5e7eb;">${escapeHtml(safe(pickFirst(formData, ['secteur'])))}</td></tr>
            <tr><td style="padding:10px 12px; border:1px solid #e5e7eb; background:#f9fafb;"><strong>Ville / zone</strong></td><td style="padding:10px 12px; border:1px solid #e5e7eb;">${escapeHtml(safe(pickFirst(formData, ['ville'])))}</td></tr>
            <tr><td style="padding:10px 12px; border:1px solid #e5e7eb; background:#f9fafb;"><strong>Contact</strong></td><td style="padding:10px 12px; border:1px solid #e5e7eb;">${escapeHtml(safe(pickFirst(formData, ['contact'])))}</td></tr>
            <tr><td style="padding:10px 12px; border:1px solid #e5e7eb; background:#f9fafb;"><strong>Email</strong></td><td style="padding:10px 12px; border:1px solid #e5e7eb;">${escapeHtml(clientEmail)}</td></tr>
            <tr><td style="padding:10px 12px; border:1px solid #e5e7eb; background:#f9fafb;"><strong>Téléphone</strong></td><td style="padding:10px 12px; border:1px solid #e5e7eb;">${escapeHtml(telephone)}</td></tr>
          </table>
        </div>

        <div style="margin-bottom: 28px;">
          <h2 style="margin: 0 0 14px 0; font-size: 18px; border-bottom: 2px solid #111827; padding-bottom: 8px;">
            2. Positionnement & stratégie
          </h2>
          <p><strong>Objectif principal :</strong> ${escapeHtml(objectifSM)}</p>
          <p><strong>Présentation de l’entreprise :</strong><br>${escapeHtml(presentationSM)}</p>
          <p><strong>Proposition de valeur :</strong><br>${escapeHtml(propositionSM)}</p>
          <p><strong>Pourquoi le client devrait la choisir :</strong><br>${escapeHtml(pourquoiChoisirSM)}</p>
        </div>

        <div style="margin-bottom: 28px;">
          <h2 style="margin: 0 0 14px 0; font-size: 18px; border-bottom: 2px solid #111827; padding-bottom: 8px;">
            3. Cible
          </h2>
          <p><strong>Client idéal :</strong><br>${escapeHtml(clientIdealSM)}</p>
          <p><strong>Type de cible :</strong> ${escapeHtml(typeCibleSM)}</p>
          <p><strong>Zone géographique :</strong> ${escapeHtml(zoneGeoSM)}</p>
        </div>

        <div style="margin-bottom: 28px;">
          <h2 style="margin: 0 0 14px 0; font-size: 18px; border-bottom: 2px solid #111827; padding-bottom: 8px;">
            4. Réseaux sociaux
          </h2>
          <p><strong>Réseaux sélectionnés :</strong> ${escapeHtml(reseauxSM || 'Aucun')}</p>
          <p><strong>Instagram :</strong> ${escapeHtml(lienInstagramSM || 'Non transmis')}</p>
          <p><strong>Facebook :</strong> ${escapeHtml(lienFacebookSM || 'Non transmis')}</p>
          <p><strong>LinkedIn :</strong> ${escapeHtml(lienLinkedInSM || 'Non transmis')}</p>
          <p><strong>TikTok :</strong> ${escapeHtml(lienTikTokSM || 'Non transmis')}</p>
        </div>

        <div style="margin-bottom: 28px;">
          <h2 style="margin: 0 0 14px 0; font-size: 18px; border-bottom: 2px solid #111827; padding-bottom: 8px;">
            5. Branding
          </h2>
          <p><strong>Charte graphique :</strong> ${escapeHtml(charteGraphiqueSM || 'Non précisé')}</p>
          <p><strong>Lien charte :</strong> ${escapeHtml(lienCharteSM || 'Non transmis')}</p>
          <p><strong>Logo disponible :</strong> ${escapeHtml(logoDispoSM || 'Non précisé')}</p>
          <p><strong>Lien logo :</strong> ${escapeHtml(lienLogoSM || 'Non transmis')}</p>
          <p><strong>Couleurs / style souhaité :</strong><br>${escapeHtml(couleursSM || 'Non précisé')}</p>
          <p><strong>Ton :</strong> ${escapeHtml(tonSM || 'Non précisé')}</p>
        </div>

        <div style="margin-bottom: 28px;">
          <h2 style="margin: 0 0 14px 0; font-size: 18px; border-bottom: 2px solid #111827; padding-bottom: 8px;">
            6. Ressources de production
          </h2>
          <p><strong>Éléments disponibles :</strong> ${escapeHtml(productionDispoSM || 'Aucun')}</p>
          <p><strong>Lien vidéos :</strong> ${escapeHtml(lienVideosSM || 'Non transmis')}</p>
          <p><strong>Lien photos :</strong> ${escapeHtml(lienPhotosSM || 'Non transmis')}</p>
          <p><strong>Témoignages texte :</strong><br>${escapeHtml(temoignagesTexteSM || 'Non transmis')}</p>
          <p><strong>Lien témoignages :</strong> ${escapeHtml(lienTemoignagesSM || 'Non transmis')}</p>
          <p><strong>Produits à filmer :</strong><br>${escapeHtml(produitsAFilmerSM || 'Non précisé')}</p>
          <p><strong>Lieu de tournage :</strong> ${escapeHtml(lieuTournageSM || 'Non précisé')}</p>
          <p><strong>Contraintes lieu :</strong> ${escapeHtml(contraintesLieuSM || 'Non précisées')}</p>
          <p><strong>Disponibilité création de contenu :</strong> ${escapeHtml(creationContenuDispoSM || 'Non précisée')}</p>
          <p><strong>Rythme de disponibilité :</strong> ${escapeHtml(disponibiliteRythmeSM || 'Non précisé')}</p>
          <p><strong>Périodes de disponibilité :</strong> ${escapeHtml(disponibilitePeriodesSM || 'Non précisées')}</p>
        </div>

        <div style="margin-bottom: 28px;">
          <h2 style="margin: 0 0 14px 0; font-size: 18px; border-bottom: 2px solid #111827; padding-bottom: 8px;">
            7. Ligne éditoriale
          </h2>
          <p><strong>Thématiques :</strong><br>${escapeHtml(thematiquesSM || 'Non précisées')}</p>
          <p><strong>Sujets à éviter :</strong><br>${escapeHtml(sujetsEviterSM || 'Non précisés')}</p>
          <p><strong>Inspirations :</strong><br>${escapeHtml(inspirationsSM || 'Non précisées')}</p>
        </div>

        ${
          packType === 'Complet'
            ? `
        <div style="margin-bottom: 28px;">
          <h2 style="margin: 0 0 14px 0; font-size: 18px; border-bottom: 2px solid #111827; padding-bottom: 8px;">
            8. Community Management
          </h2>
          <p><strong>Souhaits CM :</strong> ${escapeHtml(cmSouhaitsSM || 'Aucun')}</p>
          <p><strong>Fréquence CM :</strong> ${escapeHtml(cmFrequenceSM || 'Non précisée')}</p>
          <p><strong>Consignes / FAQ modération :</strong><br>${escapeHtml(cmAccesInfosSM || 'Non précisées')}</p>
        </div>
            `
            : ''
        }

        <div style="margin-bottom: 28px;">
          <h2 style="margin: 0 0 14px 0; font-size: 18px; border-bottom: 2px solid #111827; padding-bottom: 8px;">
            ${packType === 'Complet' ? '9' : '8'}. Objectifs & KPI
          </h2>
          <p><strong>Nombre d’abonnés visé :</strong> ${escapeHtml(nombreAbonnesSM || 'Non précisé')}</p>
          <p><strong>Engagement attendu :</strong><br>${escapeHtml(engagementAttenduSM || 'Non précisé')}</p>
          <p><strong>Génération de leads :</strong> ${escapeHtml(leadGenSM || 'Non précisé')}</p>
        </div>

        <div style="margin-bottom: 28px;">
          <h2 style="margin: 0 0 14px 0; font-size: 18px; border-bottom: 2px solid #111827; padding-bottom: 8px;">
            ${packType === 'Complet' ? '10' : '9'}. Accès & outils
          </h2>
          <p><strong>Accès aux comptes :</strong> ${escapeHtml(accesSM || 'Aucun')}</p>
          <p><strong>Instagram accès :</strong> ${escapeHtml(accesLienInstagramSM || 'Non transmis')}</p>
          <p><strong>Facebook accès :</strong> ${escapeHtml(accesLienFacebookSM || 'Non transmis')}</p>
          <p><strong>LinkedIn accès :</strong> ${escapeHtml(accesLienLinkedInSM || 'Non transmis')}</p>
          <p><strong>TikTok accès :</strong> ${escapeHtml(accesLienTikTokSM || 'Non transmis')}</p>
          <p><strong>Outils :</strong> ${escapeHtml(outilsSM || 'Non précisés')}</p>
        </div>

        <div style="margin-bottom: 28px;">
          <h2 style="margin: 0 0 14px 0; font-size: 18px; border-bottom: 2px solid #111827; padding-bottom: 8px;">
            ${packType === 'Complet' ? '11' : '10'}. Organisation
          </h2>
          <p><strong>Date de démarrage :</strong> ${escapeHtml(dateDemarrageSM || 'Non précisée')}</p>
          <p><strong>Préférence de communication :</strong> ${escapeHtml(prefCommunicationSM || 'Non précisée')}</p>
        </div>

        <div style="margin-bottom: 28px;">
          <h2 style="margin: 0 0 14px 0; font-size: 18px; border-bottom: 2px solid #111827; padding-bottom: 8px;">
            ${packType === 'Complet' ? '12' : '11'}. Validation
          </h2>
          <p><strong>Confirmation 1 :</strong> ${escapeHtml(confirmation1SM)}</p>
          <p><strong>Confirmation 2 :</strong> ${escapeHtml(confirmation2SM)}</p>
        </div>

        <div style="margin-bottom: 0;">
          <h2 style="margin: 0 0 14px 0; font-size: 18px; border-bottom: 2px solid #111827; padding-bottom: 8px;">
            Fichiers sélectionnés
          </h2>
          ${fichiersSelectionnesHtmlSM}
          <div style="margin-top:16px;">
            <h3 style="margin:0 0 10px 0; font-size:16px;">Fichiers réellement envoyés</h3>
            ${uploadedFilesHtml}
          </div>
        </div>
      </div>
    </div>
  </div>
`;

const socialMediaClientEmailHtml = `
  <div style="font-family: Arial, sans-serif; color: #111; line-height: 1.6; background: #f7f7f7; padding: 24px;">
    <div style="max-width: 720px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 16px; overflow: hidden;">
      <div style="background: #111827; color: #ffffff; padding: 24px 28px;">
        <h1 style="margin: 0; font-size: 24px;">✅ Brief bien reçu - KPS Agency</h1>
        <p style="margin: 10px 0 0 0; font-size: 14px; color: #d1d5db;">
          Offre concernée : <strong>${escapeHtml(socialOfferRaw || offre || 'Non précisée')}</strong>
        </p>
      </div>

      <div style="padding: 28px;">
        <p style="margin-top: 0;">Bonjour ${escapeHtml(nom || 'à vous')},</p>

        <p>
          Nous confirmons avoir bien reçu votre brief concernant l’offre
          <strong>${escapeHtml(socialOfferRaw || offre || 'Non précisée')}</strong>.
        </p>

        <p>
          Notre équipe va maintenant analyser votre demande, relire les éléments transmis
          et étudier la faisabilité ainsi que le cadrage du projet.
        </p>

        <div style="margin: 24px 0; padding: 16px 18px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px;">
          <h2 style="margin: 0 0 12px 0; font-size: 18px;">Résumé rapide</h2>
          <p style="margin: 6px 0;"><strong>Nom :</strong> ${escapeHtml(nom || 'Non précisé')}</p>
          <p style="margin: 6px 0;"><strong>Email :</strong> ${escapeHtml(clientEmail || 'Non précisé')}</p>
          <p style="margin: 6px 0;"><strong>Offre :</strong> ${escapeHtml(socialOfferRaw || offre || 'Non précisée')}</p>
          <p style="margin: 6px 0;"><strong>Entreprise :</strong> ${escapeHtml(entreprise || 'Non précisée')}</p>
        </div>

        <p>
          Nous reviendrons vers vous sous <strong>48 heures maximum</strong> avec un retour clair
          sur votre brief et la suite à donner.
        </p>

        <p>
          Si un ajustement ou une précision est nécessaire, nous vous recontacterons directement
          par email.
        </p>

        <p style="margin-bottom: 0;">
          Merci pour votre confiance,<br>
          <strong>KPS Agency</strong>
        </p>
      </div>
    </div>
  </div>
`;
    // ========= BLOCS HTML =========
    const projectHtml = isLandingPage
  ? `
    <h3>Projet</h3>
    <p><strong>Offre :</strong> ${escapeHtml(offre || 'Non précisée')}</p>
    <p><strong>Type d’offre :</strong> Landing Page</p>
    <p><strong>Objectif principal de la page :</strong><br>${escapeHtml(objectifLP || 'Non précisé')}</p>
    <p><strong>Offre / service mis en avant :</strong><br>${escapeHtml(offreService || 'Non précisé')}</p>
    <p><strong>Public cible :</strong><br>${escapeHtml(cibleLP || 'Non précisé')}</p>
    <p><strong>Description du projet :</strong><br>${escapeHtml(descLP || 'Non précisée')}</p>
    <p><strong>Action attendue du visiteur :</strong> ${escapeHtml(actionAttendue || 'Non précisée')}</p>
  `
  : `
    <h3>Projet</h3>
    <p><strong>Offre :</strong> ${escapeHtml(offre || 'Non précisée')}</p>
    <p><strong>Type d’offre :</strong> Site Internet Complet</p>
    <p><strong>Objectif principal du site :</strong><br>${escapeHtml(objectifSite || 'Non précisé')}</p>
    <p><strong>Public cible :</strong><br>${escapeHtml(cibleSite || 'Non précisé')}</p>
    <p><strong>Description du projet :</strong><br>${escapeHtml(descSite || 'Non précisée')}</p>
    <p><strong>Pages ou sections souhaitées :</strong><br>${escapeHtml(pagesSite || 'Non précisées')}</p>
  `;

  const siteDomainHtml = isLandingPage
  ? `
    <h3>Structure / domaine</h3>
    <p style="margin:0;">
      Aucun besoin spécifique concernant un site existant ou un nom de domaine n’a été précisé dans ce brief Landing Page.
    </p>
  `
  : `
    <h3>Structure / domaine</h3>
    <p><strong>A déjà un site existant :</strong> ${escapeHtml(hasWebsiteEn || 'Non précisé')}</p>
    ${
      hasWebsiteEn === 'Yes'
        ? `<p><strong>URL du site existant :</strong> ${escapeHtml(websiteUrl || 'Non précisée')}</p>`
        : ''
    }
    <p><strong>A un nom de domaine / hébergement :</strong> ${escapeHtml(hasDomainEn || 'Non précisé')}</p>
    ${
      hasDomainEn === 'Yes'
        ? `<p><strong>Nom de domaine :</strong> ${escapeHtml(domainName || 'Non précisé')}</p>`
        : ''
    }
  `;

const hasUploadedLogo = uploadedFiles.some(file => file.label === 'Logo');
const hasUploadedImages = uploadedFiles.some(file => file.label === 'Image');

const realHasLogoEn = hasUploadedLogo ? 'Yes' : 'No';
const realHasImagesEn = hasUploadedImages ? 'Yes' : 'No';
    
   const contentDesignHtml = isLandingPage
  ? `
    <h3>Ressources / direction créative</h3>

    <p><strong>Textes déjà prêts :</strong> ${escapeHtml(hasTextsEn || 'Non précisé')}</p>
    ${
      hasTextsEn === 'Yes'
        ? `<p><strong>Textes fournis :</strong><br>${escapeHtml(textesFournis || 'Aucun texte transmis')}</p>`
        : `<p><strong>Textes fournis :</strong><br>Aucun texte transmis pour le moment</p>`
    }

    <p><strong>Logo disponible :</strong> ${escapeHtml(realHasLogoEn || 'Non précisé')}</p>
    <p><strong>Liens utiles :</strong><br>${escapeHtml(liensUtiles || 'Aucun lien transmis')}</p>
    <p><strong>Inspirations design :</strong><br>${escapeHtml(inspirations || 'Aucune inspiration précisée')}</p>
    <p><strong>Couleurs / branding :</strong><br>${escapeHtml(couleurs || 'Aucune direction de marque précisée')}</p>
  `
: `
  <h3>Ressources / direction créative</h3>

  <p><strong>Contenus déjà prêts :</strong> ${escapeHtml(hasContentEn || 'Non précisé')}</p>

  ${
    hasContentEn === 'No'
      ? `<p><strong>Éléments manquants :</strong><br>${escapeHtml(missingElements || 'Non précisé')}</p>`
      : `<p><strong>Éléments manquants :</strong><br>Aucun manque signalé</p>`
  }

  <p><strong>Logo disponible :</strong> ${escapeHtml(realHasLogoEn || 'Non précisé')}</p>

  ${
    realHasLogoEn === 'Yes'
      ? `<p><strong>Fichier logo :</strong><br>Voir la section « Fichiers envoyés » ci-dessous</p>`
      : ''
  }

  <p><strong>Vos textes (copier-coller ou lien Drive/Notion) :</strong><br>${escapeHtml(textesFournis || 'Aucun texte transmis')}</p>

  <p><strong>Nombre d’images à intégrer :</strong> ${escapeHtml(nombreImages || 'Non précisé')}</p>

  <p><strong>Liens utiles :</strong><br>${escapeHtml(liensUtiles || 'Aucun lien transmis')}</p>
  <p><strong>Inspirations design :</strong><br>${escapeHtml(inspirations || 'Aucune inspiration précisée')}</p>
  <p><strong>Couleurs / branding :</strong><br>${escapeHtml(couleurs || 'Aucune direction de marque précisée')}</p>
`;

const googleBusinessHtml = hasGoogleBusinessDetails
  ? `
      <h3>Google Business</h3>

      <p><strong>Accompagnement Google Business :</strong> ${escapeHtml(hasGoogleBusinessEn || 'Non précisé')}</p>
      <p><strong>Fiche Google Business existante :</strong> ${escapeHtml(hasExistingGoogleBusinessEn || 'Non précisé')}</p>

      ${
        hasExistingGoogleBusinessEn === 'Yes'
          ? `<p><strong>Lien de la fiche actuelle :</strong><br>${escapeHtml(googleBusinessUrl || 'Non précisé')}</p>`
          : ''
      }

      ${
        hasExistingGoogleBusinessEn === 'No'
          ? `<p><strong>Créer une nouvelle fiche Google Business :</strong> ${escapeHtml(createGoogleBusinessEn || 'Non précisé')}</p>`
          : ''
      }

      ${
        createGoogleBusinessEn === 'Yes' || hasExistingGoogleBusinessEn === 'Yes'
          ? `
              <p><strong>Nom de l’établissement affiché :</strong> ${escapeHtml(googleBusinessName || 'Non précisé')}</p>
              <p><strong>Adresse / zone desservie :</strong> ${escapeHtml(googleBusinessAddress || 'Non précisé')}</p>
              <p><strong>Téléphone affiché :</strong> ${escapeHtml(googleBusinessPhone || 'Non précisé')}</p>
              <p><strong>Site web à relier :</strong> ${escapeHtml(googleBusinessWebsite || 'Non précisé')}</p>
              <p><strong>Catégorie d’activité :</strong> ${escapeHtml(googleBusinessCategory || 'Non précisé')}</p>
              <p><strong>Informations importantes à afficher :</strong><br>${escapeHtml(googleBusinessInfos || 'Aucune information précisée')}</p>
            `
          : ''
      }

      ${
        hasExistingGoogleBusinessEn === 'Yes'
          ? `<p><strong>Améliorations souhaitées :</strong><br>${escapeHtml(googleBusinessImprove || 'Aucune amélioration précisée')}</p>`
          : ''
      }

      <p><strong>Relier le futur site à la présence locale :</strong><br>${escapeHtml(googleBusinessGoal || 'Non précisé')}</p>
    `
  : `
      <h3>Google Business</h3>
      <p>Aucune demande Google Business spécifique n’a été précisée dans ce brief.</p>
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
              <td style="padding: 10px 12px; border: 1px solid #e5e7eb;">${escapeHtml(clientEmail)}</td>
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

    
const providerSubject = isSocialMedia
  ? `Nouveau Brief Social/Médias - ${socialOfferRaw || offre || 'Offre non précisée'}`
  : `Nouveau Brief Reçu - ${offre}`;
    
const providerHtml = isSocialMedia ? socialMediaKpsEmailHtml : kpsEmailHtml;

const kpsEmailResult = await resend.emails.send({
  from: 'KPS Agency <contact@kps-agency.com>',
  to: 'kps.agency.ia@gmail.com',
  subject: providerSubject,
  html: providerHtml,
});

if (kpsEmailResult.error) {
  console.error('Erreur envoi mail prestataire:', kpsEmailResult.error);
  return res.status(500).json({
    error: 'Failed to send provider email',
    details: kpsEmailResult.error,
  });
}


   const clientEmailHtml = `
  <div style="font-family: Arial, sans-serif; color: #111; line-height: 1.6; background: #f7f7f7; padding: 24px;">
    <div style="max-width: 720px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 16px; overflow: hidden;">
      
      <div style="background: #111827; color: #ffffff; padding: 24px 28px;">
        <h1 style="margin: 0; font-size: 24px;">✅ Brief bien reçu - KPS Agency</h1>
        <p style="margin: 10px 0 0 0; font-size: 14px; color: #d1d5db;">
          <strong>${escapeHtml(socialOfferRaw || offre || 'Non précisée')}</strong>
        </p>
      </div>

      <div style="padding: 28px;">
        <p style="margin-top: 0;">Bonjour ${escapeHtml(nom)},</p>

        <p>
          Nous confirmons avoir bien reçu votre brief concernant l’offre
         <strong>${escapeHtml(socialOfferRaw || offre || 'Non précisée')}</strong
        </p>

        <p>
          Notre équipe va maintenant analyser votre demande, relire les éléments transmis
          et étudier la faisabilité ainsi que le cadrage du projet.
        </p>

        <div style="margin: 24px 0; padding: 16px 18px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px;">
          <h2 style="margin: 0 0 12px 0; font-size: 18px;">Résumé rapide</h2>
          <p style="margin: 6px 0;"><strong>Nom :</strong> ${escapeHtml(nom)}</p>
          <p style="margin: 6px 0;"><strong>Email :</strong> ${escapeHtml(clientEmail)}</p>
          <p style="margin: 6px 0;"><strong>Offre :</strong> ${escapeHtml(socialOfferRaw || offre || 'Non précisée')}</p>
          <p style="margin: 6px 0;"><strong>Entreprise / activité :</strong> ${escapeHtml(entreprise)}</p>
        </div>

        <p>
          Nous reviendrons vers vous sous <strong>48 heures maximum</strong> avec un retour clair
          sur votre brief et la suite à donner.
        </p>

        <p>
          Si un ajustement ou une précision est nécessaire, nous vous recontacterons directement
          par email.
        </p>

        <p style="margin-bottom: 0;">
          Merci pour votre confiance,<br>
          <strong>KPS Agency</strong>
        </p>
      </div>
    </div>
  </div>
`;

 const clientSubject = isSocialMedia
  ? 'Brief Social/Médias bien reçu - KPS Agency'
  : 'Brief bien reçu - KPS Agency';

const clientHtml = isSocialMedia ? socialMediaClientEmailHtml : clientEmailHtml;

const clientEmailResult = await resend.emails.send({
  from: 'KPS Agency <contact@kps-agency.com>',
  to: clientEmail,
  subject: clientSubject,
  html: clientHtml,
});

    if (clientEmailResult.error) {
      console.error('Erreur envoi mail client:', clientEmailResult.error);
      return res.status(500).json({
        error: 'Failed to send client email',
        details: clientEmailResult.error,
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Client and provider emails sent successfully',
      kpsEmailId: kpsEmailResult.data?.id || null,
      clientEmailId: clientEmailResult.data?.id || null,
      filesCount: uploadedFiles.length,
    });
  } catch (error) {
    console.error('Server error:', error);

    return res.status(500).json({
      error: 'Server error',
      details: error.message,
    });
  }
}
