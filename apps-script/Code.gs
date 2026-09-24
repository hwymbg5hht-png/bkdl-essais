/**
 * BKDL Essais, script Google (le « serveur » de l'app).
 *
 * Il reçoit les demandes de l'iPhone, vérifie le PIN, lit le classeur
 * et renvoie la liste du cours. Les calculs sont dans le fichier « Logique ».
 *
 * Réglages rangés dans Paramètres du projet, Propriétés du script
 * (jamais dans ce code, qui est public) :
 *   PIN          le code à 4 chiffres ou plus saisi sur l'iPhone
 *   ID_CLASSEUR  l'identifiant du classeur (d'abord la copie TEST, puis le vrai)
 *
 * Étape 1 : lecture seule. Ce script n'écrit rien dans le classeur.
 */

var VERSION = '1';
var ONGLET_SUIVI = 'Suivi des demandes';
var ONGLET_LISTES = 'Listes';
var ESSAIS_PIN_MAX = 5;          // après 5 PIN faux...
var BLOCAGE_PIN_SECONDES = 900;  // ...blocage 15 minutes

// Valeurs de secours si l'onglet Listes est illisible (chaînes exactes, sans accents)
var LISTES_SECOURS = {
  OuiNon: ['Oui', 'Non'],
  ReponseRappel: ['OUI', 'Report', 'Sans reponse'],
  Origine: ['Un ami, un proche, un collegue', 'Une recherche Google',
    'Le compte Instagram du club', 'Une publicite Facebook ou Instagram',
    'Une affiche, un stand, un evenement', 'Un article ou un media local',
    'Une reponse d\'une IA (ChatGPT, Gemini, Perplexity)', 'Autre'],
  Canal: ['Bouche a oreille', 'Google', 'Instagram organique', 'Facebook organique',
    'Publicite Meta', 'Affichage ou evenement', 'Presse locale', 'IA generative',
    'Autre', 'Indetermine'],
  Motif: ['Prix', 'Horaire', 'Distance', 'Intensite', 'A repris ailleurs',
    'Sans reponse', 'Autre']
};

/* ---------- Points d'entrée ---------- */

/** Ouvrir l'adresse du script dans un navigateur affiche juste ce message. */
function doGet() {
  return ContentService.createTextOutput(
    'BKDL Essais : le script répond (version ' + VERSION + '). Aucune donnée ici.');
}

/**
 * Toutes les demandes de l'app arrivent ici, en POST, pour que le PIN
 * ne passe jamais dans l'adresse web.
 * Corps attendu : { pin, action, ... }
 */
function doPost(e) {
  var reponse;
  try {
    var demande = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    verifierPin(demande.pin);
    reponse = traiter(demande);
  } catch (err) {
    reponse = { ok: false, message: err && err.message ? err.message : String(err) };
  }
  return ContentService.createTextOutput(JSON.stringify(reponse))
    .setMimeType(ContentService.MimeType.JSON);
}

function traiter(demande) {
  switch (demande.action) {
    case 'test': return actionTest();
    case 'cours': return actionCours(demande);
    default: throw new Error('Action inconnue : ' + demande.action);
  }
}

/* ---------- Actions ---------- */

/** Vérifie que tout est bien branché (bouton « Tester » des réglages). */
function actionTest() {
  var classeur = ouvrirClasseur();
  var onglet = ongletSuivi(classeur);
  return {
    ok: true,
    version: VERSION,
    classeur: classeur.getName(),
    lignes: Math.max(0, onglet.getLastRow() - 2),
    avertissement: avertissementFuseau()
  };
}

/**
 * Liste du cours d'un jour.
 * demande.jour : « 2026-09-29 », par défaut aujourd'hui.
 */
function actionCours(demande) {
  var aujourdhui = aMinuit(new Date());
  var jour = /^\d{4}-\d{2}-\d{2}$/.test(demande.jour || '') ? demande.jour : cleJour(aujourdhui);
  var classeur = ouvrirClasseur();
  var lignes = lireToutesLesLignes(ongletSuivi(classeur));
  return {
    ok: true,
    version: VERSION,
    aujourdhui: cleJour(aujourdhui),
    jour: jour,
    dates: datesDeCours(lignes, aujourdhui),
    cours: coursDuJour(lignes, jour, aujourdhui),
    listes: lireListes(classeur),
    lu: Utilities.formatDate(new Date(), 'Europe/Paris', "HH'h'mm"),
    avertissement: avertissementFuseau()
  };
}

/* ---------- Sécurité ---------- */

function verifierPin(pin) {
  var attendu = PropertiesService.getScriptProperties().getProperty('PIN');
  if (!attendu) throw new Error('Le PIN n\'est pas encore défini dans les Propriétés du script.');
  var cache = CacheService.getScriptCache();
  var echecs = Number(cache.get('echecs_pin') || 0);
  if (echecs >= ESSAIS_PIN_MAX) {
    throw new Error('Trop de PIN faux. Réessaie dans 15 minutes.');
  }
  if (String(pin || '') !== String(attendu)) {
    cache.put('echecs_pin', String(echecs + 1), BLOCAGE_PIN_SECONDES);
    throw new Error('PIN incorrect.');
  }
  if (echecs) cache.remove('echecs_pin');
}

/* ---------- Classeur ---------- */

function ouvrirClasseur() {
  var id = PropertiesService.getScriptProperties().getProperty('ID_CLASSEUR');
  if (!id) throw new Error('L\'identifiant du classeur n\'est pas défini dans les Propriétés du script.');
  try {
    return SpreadsheetApp.openById(id.trim());
  } catch (err) {
    throw new Error('Impossible d\'ouvrir le classeur. Vérifie ID_CLASSEUR dans les Propriétés du script.');
  }
}

function ongletSuivi(classeur) {
  var onglet = classeur.getSheetByName(ONGLET_SUIVI);
  if (!onglet) throw new Error('Onglet « ' + ONGLET_SUIVI + ' » introuvable dans ' + classeur.getName() + '.');
  return onglet;
}

/**
 * Lit tout l'onglet d'un coup (colonnes A à AB).
 * Les numéros de ligne ne servent qu'à cet instant : le classeur est retrié chaque jour.
 */
function lireToutesLesLignes(onglet) {
  var derniere = onglet.getLastRow();
  if (derniere < PREMIERE_LIGNE_DONNEES) return [];
  var valeurs = onglet.getRange(2, 1, derniere - 1, NB_COLONNES).getValues();
  return valeurs.map(function (v, i) { return lireLigne(v, i + 2); });
}

/**
 * Relit les listes déroulantes dans l'onglet Listes.
 * On cherche d'abord une plage nommée (OuiNon, Origine...), puis une colonne
 * dont l'en-tête ressemble au nom de la liste. À défaut, valeurs de secours.
 */
function lireListes(classeur) {
  var resultat = {}, sources = {};
  var onglet = classeur.getSheetByName(ONGLET_LISTES);
  var tableau = onglet ? onglet.getDataRange().getDisplayValues() : [];
  var alias = {
    OuiNon: ['ouinon'], ReponseRappel: ['reponserappel', 'reponseaurappel'],
    Origine: ['origine'], Canal: ['canal'], Motif: ['motif']
  };
  Object.keys(LISTES_SECOURS).forEach(function (nom) {
    var valeurs = null;
    try {
      var plage = classeur.getRangeByName(nom);
      if (plage) { valeurs = aplatir(plage.getDisplayValues()); sources[nom] = 'plage nommée'; }
    } catch (err) { /* pas de plage nommée */ }
    if (!valeurs && tableau.length) {
      for (var c = 0; c < tableau[0].length && !valeurs; c++) {
        var entete = texteSimple(tableau[0][c]).replace(/[^a-z]/g, '');
        if (alias[nom].some(function (a) { return entete.indexOf(a) === 0; })) {
          valeurs = tableau.slice(1).map(function (ligne) { return ligne[c]; });
          sources[nom] = 'onglet Listes, colonne ' + (c + 1);
        }
      }
    }
    valeurs = (valeurs || []).map(function (x) { return String(x).trim(); })
      .filter(function (x) { return x !== ''; });
    if (!valeurs.length) { valeurs = LISTES_SECOURS[nom]; sources[nom] = 'secours'; }
    resultat[nom] = valeurs;
  });
  resultat._sources = sources;
  return resultat;
}

function aplatir(tableau) {
  return tableau.reduce(function (acc, ligne) { return acc.concat(ligne); }, []);
}

function avertissementFuseau() {
  var fuseau = Session.getScriptTimeZone();
  return fuseau === 'Europe/Paris' ? '' :
    'Le fuseau du script est ' + fuseau + '. Mets « (GMT+01:00) Paris » dans Paramètres du projet.';
}

/* ---------- Pour tester depuis l'éditeur (bouton Exécuter) ---------- */

/** Choisis « essaiLecture » dans la liste en haut puis clique sur Exécuter. */
function essaiLecture() {
  var r = actionCours({});
  Logger.log('Classeur lu à ' + r.lu + ', cours du ' + r.jour + ' : ' +
    r.cours.attendus.length + ' attendus, ' + r.cours.annules.length + ' annulés, ' +
    r.cours.reportes.length + ' reportés ailleurs.');
  Logger.log('Prochaines dates : ' + r.dates.filter(function (d) { return d >= r.aujourdhui; }).slice(0, 5).join(', '));
  Logger.log('Listes lues : ' + JSON.stringify(r.listes._sources));
  if (r.avertissement) Logger.log('ATTENTION : ' + r.avertissement);
}
