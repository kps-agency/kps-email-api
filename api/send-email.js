import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

function safe(value, fallback = '-') {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'string' && value.trim() === '') return fallback;
  return value;
}

function yesNo(value) {
  if (value === true) return 'Oui';
  if (value === false) return 'Non';
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (['oui', 'yes', 'true', '1'].includes(v)) return 'Oui';
    if (['non', 'no', 'false', '0'].includes(v)) return 'Non';
  }
  return '-';
}

function normalizeFormData(raw = {}) {
  const formData = raw.formData || raw || {};

  return {
    // Infos client
    nom: formData.nom || formData.name || formData.fullName || '',
    email: formData.email || formData.clientEmail || '',
    telephone: formData.telephone || formData.phone || '',
    entreprise: formData.entreprise || formData.entrepriseActivite || formData.business || '',

    // Offre
    offre: formData.offre || formData.offer || '',
    offreType: formData.offreType || formData.offerType || '',

    // Bloc vision / business
    objectif: formData.objectif || formData.objectifPrincipal || formData.objectifPrincipalPage || '',
    offreMiseEnAvant: formData.offreMiseEnAvant || formData.serviceMisEnAvant || '',
    cible: formData.cible || formData.publicCible || '',
    description: formData.description || formData.descriptionProjet || '',

    // Bloc conversion
    actionAttendue: formData.actionAttendue || formData.conversionGoal || '',

    // Bloc site / structure
    pages: formData.pages || formData.pagesSouhaitees || '',
    nombrePages: formData.nombrePages || '',

    // Site existant / domaine
    siteExistant: formData.siteExistant || formData.hasExistingSite || '',
    urlExistante: formData.urlExistante || formData.siteUrl || '',
    domaineReserve: formData.domaineReserve || formData.hasDomain || '',
    nomDeDomaine: formData.nomDeDomaine || formData.domainName || '',

    // Ressources
    textesDisponibles: formData.textesDisponibles || formData.textesFournisDispo || formData.hasTexts || '',
    textesFournis: formData.textesFournis || formData.textes || '',
    logoDisponible: formData.logoDisponible || formData.hasLogo || '',
    imagesDisponibles: formData.imagesDisponibles || formData.hasImages || '',
    nombreImages: formData.nombreImages || formData.imagesCount || '',
    liensUtiles: formData.liensUtiles || formData.usefulLinks || '',

    // Direction créative
    inspirations: formData.inspirations || formData.inspirationsDesign || '',
    branding: formData.branding || formData.couleursBranding || '',

    // Cadrage
    deadline: formData.deadline || formData.urgence || '',
    contraintes: formData.contraintes || formData.contraintesSpecifiques || '',

    // Validation
    confirmation: formData.confirmation === true || formData.confirmation === 'true' || formData.confirmation === 'oui',

    // Brut
    raw: formData
  };
}

function buildAdminHtml(data, uploadedFiles = []) {
  const filesList = uploadedFiles.length
    ? `
      <ul>
        ${uploadedFiles.map(file => `<li><strong>${safe(file.name)}</strong> (${safe(file.type, 'type inconnu')})</li>`).join('')}
      </ul>
    `
    : `<p>-</p>`;

  return `
    <div style="font-family: Arial, sans-serif; color: #111; line-height: 1.6;">
      <h2 style="margin-bottom: 16px;">📩 Nouveau Brief Reçu - KPS Agency</h2>

      <p><strong>Email client :</strong> ${safe(data.email)}</p>

      <hr style="margin: 20px 0;" />

      <h3>Informations client</h3>
      <p><strong>Nom :</strong> ${safe(data.nom)}</p>
      <p><strong>Email :</strong> ${safe(data.email)}</p>
      <p><strong>Téléphone :</strong> ${safe(data.telephone)}</p>
      <p><strong>Entreprise :</strong> ${safe(data.entreprise)}</p>

      <hr style="margin: 20px 0;" />

      <h3>Projet</h3>
      <p><strong>Offre :</strong> ${safe(data.offre)}</p>
      <p><strong>Type d'offre :</strong> ${safe(data.offreType)}</p>
      <p><strong>Objectif :</strong> ${safe(data.objectif)}</p>
      <p><strong>Offre / service mis en avant :</strong> ${safe(data.offreMiseEnAvant)}</p>
      <p><strong>Cible :</strong> ${safe(data.cible)}</p>
      <p><strong>Description :</strong><br>${safe(data.description)}</p>
      <p><strong>Action attendue du visiteur :</strong> ${safe(data.actionAttendue)}</p>
      <p><strong>Pages / sections souhaitées :</strong> ${safe(data.pages)}</p>
      <p><strong>Nombre de pages :</strong> ${safe(data.nombrePages)}</p>

      <hr style="margin: 20px 0;" />

      <h3>Site existant / domaine</h3>
      <p><strong>Site existant :</strong> ${yesNo(data.siteExistant)}</p>
      <p><strong>URL existante :</strong> ${safe(data.urlExistante)}</p>
      <p><strong>Domaine déjà réservé :</strong> ${yesNo(data.domaineReserve)}</p>
      <p><strong>Nom de domaine :</strong> ${safe(data.nomDeDomaine)}</p>

      <hr style="margin: 20px 0;" />

      <h3>Contenu / design</h3>
      <p><strong>Inspirations :</strong><br>${safe(data.inspirations)}</p>
      <p><strong>Couleurs / branding :</strong><br>${safe(data.branding)}</p>
      <p><strong>Textes déjà prêts :</strong> ${yesNo(data.textesDisponibles)}</p>
      <p><strong>Textes fournis :</strong><br>${safe(data.textesFournis)}</p>
      <p><strong>Logo disponible :</strong> ${yesNo(data.logoDisponible)}</p>
      <p><strong>Images / visuels disponibles :</strong> ${yesNo(data.imagesDisponibles)}</p>
      <p><strong>Nombre d'images :</strong> ${safe(data.nombreImages)}</p>
      <p><strong>Liens utiles :</strong><br>${safe(data.liensUtiles)}</p>

      <hr style="margin: 20px 0;" />

      <h3>Fichiers uploadés</h3>
      ${filesList}

      <hr style="margin: 20px 0;" />

      <h3>Contraintes / timing</h3>
      <p><strong>Deadline :</strong> ${safe(data.deadline)}</p>
      <p><strong>Contraintes spécifiques :</strong><br>${safe(data.contraintes)}</p>

      <hr style="margin: 20px 0;" />

      <p><strong>Confirmation cadre commercial :</strong> ${data.confirmation ? 'Oui' : 'Non'}</p>
    </div>
  `;
}

function buildClientHtml(data) {
  return `
    <div style="font-family: Arial, sans-serif; color: #111; line-height: 1.6;">
      <h2>Merci pour votre brief 👋</h2>
      <p>Bonjour ${safe(data.nom, 'à vous')},</p>
      <p>
        Nous avons bien reçu votre demande concernant l’offre
        <strong>${safe(data.offre)}</strong>.
      </p>
      <p>
        Notre équipe va analyser votre brief et revenir vers vous avec la suite du process.
      </p>
      <p>
        <strong>Récapitulatif rapide :</strong><br>
        Offre : ${safe(data.offre)}<br>
        Objectif : ${safe(data.objectif)}<br>
        Deadline : ${safe(data.deadline)}
      </p>
      <p>
        Si nécessaire, nous vous recontacterons pour préciser certains points avant validation.
      </p>
      <p>À bientôt,<br><strong>KPS Agency</strong></p>
    </div>
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
    console.log('=== RAW req.body ===');
    console.log(JSON.stringify(req.body, null, 2));
    console.log('=== END RAW req.body ===');

    const body = req.body || {};
    const normalized = normalizeFormData(body);
    const clientEmail = body.clientEmail || normalized.email || '';
    const uploadedFiles = Array.isArray(body.uploadedFiles) ? body.uploadedFiles : [];

    console.log('=== NORMALIZED DATA ===');
    console.log(JSON.stringify(normalized, null, 2));
    console.log('=== clientEmail ===', clientEmail);
    console.log('=== uploadedFiles count ===', uploadedFiles.length);

    if (!clientEmail) {
      return res.status(400).json({
        error: 'Missing client email',
      });
    }

    const attachments = uploadedFiles
      .filter(file => file && file.name && file.content)
      .map(file => ({
        filename: file.name,
        content: file.content,
        contentType: file.type || 'application/octet-stream',
      }));

    console.log('=== attachments prepared ===', attachments.length);

    const adminHtml = buildAdminHtml(normalized, uploadedFiles);
    const clientHtml = buildClientHtml(normalized);

    const kpsEmailResult = await resend.emails.send({
      from: 'KPS Agency <contact@kps-agency.com>',
      to: ['kps.agency.ia@gmail.com'],
      subject: `Nouveau Brief Reçu - ${safe(normalized.offre, 'KPS Agency')}`,
      html: adminHtml,
      attachments,
    });

    console.log('KPS EMAIL RESULT:', kpsEmailResult);

    if (kpsEmailResult.error) {
      console.error('KPS EMAIL ERROR:', kpsEmailResult.error);
      return res.status(500).json({
        error: 'Failed to send admin email',
        details: kpsEmailResult.error,
      });
    }

    const clientEmailResult = await resend.emails.send({
      from: 'KPS Agency <contact@kps-agency.com>',
      to: [clientEmail],
      subject: 'Confirmation de réception de votre brief - KPS Agency',
      html: clientHtml,
    });

    console.log('CLIENT EMAIL RESULT:', clientEmailResult);

    if (clientEmailResult.error) {
      console.error('CLIENT EMAIL ERROR:', clientEmailResult.error);
      return res.status(500).json({
        error: 'Failed to send client email',
        details: clientEmailResult.error,
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Emails sent successfully',
      adminEmailId: kpsEmailResult.data?.id || null,
      clientEmailId: clientEmailResult.data?.id || null,
      attachmentsCount: attachments.length,
      normalizedData: normalized,
    });
  } catch (error) {
    console.error('SERVER ERROR:', error);
    return res.status(500).json({
      error: 'Server error',
      details: error.message,
    });
  }
}
