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

    if (event.type !== 'checkout.session.completed') {
      return res.status(200).json({ received: true, ignored: true });
    }

    const session = event.data.object;

    const customerEmail =
      session.customer_details?.email ||
      session.customer_email ||
      null;

    if (!customerEmail) {
      return res.status(400).json({
        error: 'No customer email found in Stripe session',
      });
    }

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

    const matchedBrief = briefs[0];

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

    // ========= INFOS CLIENT =========
    const nom = safe(matchedBrief.client_name || pickFirst(formData, ['nom', 'name', 'fullName']));
    const clientEmail = safe(matchedBrief.client_email || pickFirst(formData, ['email']));
    const telephone = safe(matchedBrief.phone || pickFirst(formData, ['telephone', 'phone']));
    const entreprise = safe(
      matchedBrief.company ||
      pickFirst(formData, ['entreprise', 'entrepriseActivite', 'company', 'activity'])
    );

    const offre = safe(matchedBrief.offre || pickFirst(formData, ['offre', 'offer', 'selectedOffer']));

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

    // ========= SITE COMPLET =========
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

    const hasWebsiteEn = boolToYesNo(
      pickFirst(formData, ['hasWebsite', 'siteExistant', 'existingWebsite'])
    );

    const websiteUrl = safe(
      pickFirst(formData, ['websiteUrl', 'urlExistante', 'existingUrl'])
    );

    const hasDomainEn = boolToYesNo(
      pickFirst(formData, ['hasDomain', 'domaineReserve', 'domainAlreadyBooked'])
    );

    const domainName = safe(
      pickFirst(formData, ['domainName', 'nomDeDomaine', 'domain'])
    );

    // ========= RESSOURCES =========
    const hasTextsEn = boolToYesNo(
      pickFirst(formData, ['hasTexts', 'textesDejaPrets', 'textsReady'])
    );

    const textesFournis = safe(
      pickFirst(formData, ['textesFournis', 'providedTexts'])
    );

    const hasContentEn = boolToYesNo(
      pickFirst(formData, ['hasContent', 'contenusDejaPrets', 'contentReady'])
    );

    const missingElements = safe(
      pickFirst(formData, ['missingElements', 'elementsManquants'])
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

    // ========= GOOGLE BUSINESS =========
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

    const hasExistingGoogleBusinessEn = boolToYesNo(
      pickFirst(formData, [
        'hasExistingGoogleBusiness',
        'ficheGoogleBusinessExistante',
        'existingGoogleBusiness',
        'hasGoogleBusinessProfileLP',
        'hasGoogleBusinessProfileSite',
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
    const hasUploadedImages = uploadedFiles.some(file => file.label && file.label.startsWith('Image'));

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
        <p><strong>Images / visuels disponibles :</strong> ${escapeHtml(realHasImagesEn || 'Non précisé')}</p>
        <p><strong>Nombre d’images :</strong> ${escapeHtml(nombreImages || 'Aucun volume précisé')}</p>
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
        <p><strong>Images / visuels disponibles :</strong> ${escapeHtml(realHasImagesEn || 'Non précisé')}</p>
        <p><strong>Nombre d’images à intégrer :</strong> ${escapeHtml(nombreImages || 'Non précisé')}</p>
        <p><strong>Vos textes (copier-coller ou lien Drive/Notion) :</strong><br>${escapeHtml(textesFournis || 'Aucun texte transmis')}</p>
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

    const uploadedFilesHtml = buildUploadedFilesHtml(uploadedFiles);

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
