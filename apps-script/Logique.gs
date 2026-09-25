/**
 * BKDL Essais, logique pure (sans accès au classeur).
 *
 * Ce fichier contient tous les calculs : lire une date écrite à la main,
 * nettoyer un téléphone, savoir qui est attendu un jour donné, retrouver
 * la bonne ligne d'une personne. Il ne lit ni n'écrit rien dans le classeur,
 * ce qui permet de le tester automatiquement sur le Mac (dossier tests).
 *
 * Il se colle tel quel dans l'éditeur Apps Script, dans un fichier
 * nommé « Logique », à côté de « Code ».
 */

/* ---------- Colonnes de l'onglet Suivi des demandes (A = 1) ---------- */

var COL = {
  N: 1, DATE_DEMANDE: 2, PRENOM: 3, NOM: 4, TELEPHONE: 5, EMAIL: 6,
  CRENEAU: 7, DATE_ESSAI: 8, DELAI: 9, MAIL_CONFIRMATION: 10,
  SMS_RAPPEL: 11, REPONSE_RAPPEL: 12, REPORTE: 13, NOUVELLE_DATE: 14,
  VENU: 15, ORIGINE: 16, UTM_SOURCE: 17, UTM_CAMPAGNE: 18,
  DECLENCHEUR: 19, CANAL: 20, MAIL_POST_ESSAI: 21, SMS_RELANCE: 22,
  INSCRIT: 23, DATE_INSCRIPTION: 24, MOTIF: 25, AVIS_1: 26, AVIS_2: 27,
  REMARQUES: 28
};
var NB_COLONNES = 28;         // A à AB
var PREMIERE_LIGNE_DONNEES = 3; // ligne 2 = exemple fictif, toujours ignorée

var JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
var MOIS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet',
  'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
var MOIS_ACCENTUES = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
// Formes courtes acceptées en plus des noms complets
var MOIS_COURTS = { janv: 0, fev: 1, fevr: 1, avr: 3, juil: 6, sept: 8, oct: 9, nov: 10, dec: 11 };

/* ---------- Outils texte ---------- */

/** Enlève les accents, passe en minuscules, resserre les espaces. */
function texteSimple(s) {
  if (s === null || s === undefined) return '';
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Deux prénoms sont-ils la même personne ? (accents, tirets et casse ignorés) */
function prenomsEgaux(a, b) {
  var x = texteSimple(a).replace(/[-'’.]/g, ' ').replace(/\s+/g, ' ').trim();
  var y = texteSimple(b).replace(/[-'’.]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!x || !y) return false;
  if (x === y) return true;
  // « Jean-Marc » et « Jean » : on accepte si le premier mot est identique
  return x.split(' ')[0] === y.split(' ')[0];
}

/* ---------- Téléphone et email ---------- */

/**
 * Ramène un téléphone français à 10 chiffres commençant par 0.
 * Renvoie une chaîne vide si le numéro n'est pas valable.
 *   « 06 44 08 89 08 », « +33 6 44 08 89 08 », « 33644088908 »,
 *   « +330615585548 » (0 en trop après +33) donnent tous 10 chiffres.
 */
function normaliserTelephone(valeur) {
  if (valeur === null || valeur === undefined) return '';
  var c = String(valeur).replace(/\D/g, '');
  if (c.indexOf('0033') === 0) c = c.slice(4);
  else if (c.indexOf('33') === 0 && (c.length === 11 || c.length === 12)) c = c.slice(2);
  if (c.length === 9 && c.charAt(0) !== '0') c = '0' + c; // 0 initial perdu par le classeur
  if (c.length !== 10 || c.charAt(0) !== '0') return '';
  return c;
}

/** « 0612345678 » devient « 06 12 34 56 78 ». */
function formaterTelephone(valeur) {
  var c = normaliserTelephone(valeur);
  if (!c) return valeur ? String(valeur).trim() : '';
  return c.replace(/(\d{2})(?=\d)/g, '$1 ');
}

function normaliserEmail(valeur) {
  if (valeur === null || valeur === undefined) return '';
  return String(valeur).trim().toLowerCase();
}

/* ---------- Dates ---------- */

function estDateValide(d) {
  return Object.prototype.toString.call(d) === '[object Date]' && !isNaN(d.getTime());
}

/** Date à minuit (heure locale du script, Europe/Paris). */
function aMinuit(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Clé « 2026-09-29 » pour comparer deux jours sans se soucier des heures. */
function cleJour(d) {
  if (!estDateValide(d)) return '';
  var m = d.getMonth() + 1, j = d.getDate();
  return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (j < 10 ? '0' : '') + j;
}

/** « 2026-09-29 » redevient une date. */
function dateDepuisCle(cle) {
  var p = String(cle).split('-');
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}

/** « mardi 29 septembre », format de la colonne G. */
function formaterCreneau(d) {
  return JOURS[d.getDay()] + ' ' + d.getDate() + ' ' + MOIS_ACCENTUES[d.getMonth()];
}

/** « 29/09 » */
function formaterJourMois(d) {
  var j = d.getDate(), m = d.getMonth() + 1;
  return (j < 10 ? '0' : '') + j + '/' + (m < 10 ? '0' : '') + m;
}

/** Construit une date en refusant les dates impossibles (31 février...). */
function construireDate(annee, mois, jour) {
  var d = new Date(annee, mois, jour);
  if (d.getFullYear() !== annee || d.getMonth() !== mois || d.getDate() !== jour) return null;
  return d;
}

/**
 * Lit une date d'essai écrite dans G ou N.
 *
 * Formats reconnus : vraie date du classeur, « 29/9/2026 », « 6/10 »,
 * « mardi 22 septembre », « 22 septembre 2026 », « 1er octobre ».
 * Tout le reste (« STAGE de préférence », « ???? », vide) renvoie null.
 *
 * Sans année écrite, on choisit l'année grâce à la date de la demande
 * (colonne B) : l'essai tombe forcément peu après la demande. Si le jour
 * de la semaine est écrit (« mardi »), il sert à confirmer.
 *
 * @param valeur          contenu de la cellule
 * @param dateDemande     contenu de la colonne B (peut être vide)
 * @param aujourdhui      date du jour (utile seulement si B est vide)
 * @return null, ou { date, aVerifier } où aVerifier signale un doute
 */
function lireDateEssai(valeur, dateDemande, aujourdhui) {
  if (valeur === null || valeur === undefined || valeur === '') return null;
  if (estDateValide(valeur)) return { date: aMinuit(valeur), aVerifier: false };
  if (typeof valeur === 'number') return null;

  var t = texteSimple(valeur);
  if (!t) return null;

  var jour = null, mois = null, annee = null, reste = t;

  // Format chiffres : 29/9/2026, 6/10, 29-09-26, 29.09.2026
  var m = t.match(/(\d{1,2})\s*[\/.-]\s*(\d{1,2})(?:\s*[\/.-]\s*(\d{2,4}))?/);
  if (m) {
    jour = Number(m[1]); mois = Number(m[2]) - 1;
    if (m[3]) annee = Number(m[3]);
    reste = t.replace(m[0], ' ');
  } else {
    // Format texte : 22 septembre 2026, 1er octobre
    var noms = MOIS.concat(Object.keys(MOIS_COURTS)).join('|');
    var re = new RegExp('(\\d{1,2})(?:er)?\\s+(' + noms + ')\\.?(?:\\s+(\\d{4}))?(?![a-z])');
    m = t.match(re);
    if (!m) return null;
    jour = Number(m[1]);
    mois = MOIS.indexOf(m[2]);
    if (mois < 0) mois = MOIS_COURTS[m[2]];
    if (m[3]) annee = Number(m[3]);
    reste = t.replace(m[0], ' ');
  }
  if (mois < 0 || mois > 11 || jour < 1 || jour > 31) return null;

  // Jour de la semaine écrit ? (« mardi »)
  var jourSemaine = -1;
  for (var i = 0; i < JOURS.length; i++) {
    var reJour = new RegExp('(^|[^a-z])' + JOURS[i] + '([^a-z]|$)');
    if (reJour.test(reste)) { jourSemaine = i; reste = reste.replace(JOURS[i], ' '); break; }
  }
  // D'autres mots que la date ? (« 6/10 si possible ») : on garde la date mais on la signale
  var motsEnTrop = /[a-z]{2,}/.test(reste.replace(/\b(le|l|a|h|et)\b/g, ' ').replace(/\d+h\d*/g, ' '));

  if (annee !== null) {
    if (annee < 100) annee += 2000;
    var d = construireDate(annee, mois, jour);
    if (!d) return null;
    var douteJour = jourSemaine >= 0 && d.getDay() !== jourSemaine;
    return { date: d, aVerifier: douteJour || motsEnTrop };
  }

  // Pas d'année : on essaie l'année d'avant, celle-ci et la suivante
  var repere = estDateValide(dateDemande) ? aMinuit(dateDemande) : null;
  var base = repere || (estDateValide(aujourdhui) ? aMinuit(aujourdhui) : aMinuit(new Date()));
  var candidats = [];
  for (var a = base.getFullYear() - 1; a <= base.getFullYear() + 1; a++) {
    var c = construireDate(a, mois, jour);
    if (c) candidats.push(c);
  }
  if (!candidats.length) return null;

  var doute = motsEnTrop;
  if (repere) {
    // L'essai tombe au plus tôt 7 jours avant la demande (marge de saisie)
    var limite = repere.getTime() - 7 * 86400000;
    var plausibles = candidats.filter(function (c) { return c.getTime() >= limite; });
    if (plausibles.length) candidats = plausibles;
  }
  if (jourSemaine >= 0) {
    var concordants = candidats.filter(function (c) { return c.getDay() === jourSemaine; });
    if (concordants.length) candidats = concordants;
    else doute = true; // « mardi 23 septembre » alors que le 23 est un mercredi
  }

  var choisi = null;
  if (repere) {
    // La première date plausible
    candidats.forEach(function (c) {
      if (!choisi || c.getTime() < choisi.getTime()) choisi = c;
    });
  }
  if (!choisi) {
    // Pas de date de demande : la date la plus proche d'aujourd'hui
    candidats.forEach(function (c) {
      if (!choisi || Math.abs(c - base) < Math.abs(choisi - base)) choisi = c;
    });
    if (!repere && jourSemaine < 0) doute = true;
  }
  return { date: choisi, aVerifier: doute };
}

/* ---------- Lignes du classeur ---------- */

/**
 * Transforme une ligne brute (tableau A à AB) en objet lisible.
 * numeroLigne = numéro dans le classeur, valable seulement au moment de la lecture.
 */
function lireLigne(valeurs, numeroLigne) {
  function v(col) { var x = valeurs[col - 1]; return x === undefined ? '' : x; }
  return {
    numeroLigne: numeroLigne,
    dateDemande: v(COL.DATE_DEMANDE),
    prenom: String(v(COL.PRENOM)).trim(),
    nom: String(v(COL.NOM)).trim(),
    telephone: v(COL.TELEPHONE),
    email: v(COL.EMAIL),
    creneau: v(COL.CRENEAU),
    dateEssai: v(COL.DATE_ESSAI),
    smsRappel: v(COL.SMS_RAPPEL),
    reponseRappel: v(COL.REPONSE_RAPPEL),
    reporte: v(COL.REPORTE),
    nouvelleDate: v(COL.NOUVELLE_DATE),
    venu: v(COL.VENU),
    origine: v(COL.ORIGINE),
    declencheur: v(COL.DECLENCHEUR),
    canal: v(COL.CANAL),
    inscrit: v(COL.INSCRIT),
    dateInscription: v(COL.DATE_INSCRIPTION),
    motif: v(COL.MOTIF),
    remarques: v(COL.REMARQUES)
  };
}

function estOui(x) {
  if (x === true) return true;
  var t = texteSimple(x);
  return t === 'oui' || t === 'true' || t === 'vrai';
}

/** Case cochée, « Oui », ou une date écrite : le rappel est parti. */
function rappelEnvoye(x) {
  if (x === true || estDateValide(x)) return true;
  var t = texteSimple(x);
  return t !== '' && t !== 'non' && t !== 'false' && t !== 'faux';
}

/**
 * Date d'essai effective : N si elle est lisible, sinon G.
 * @return { g, n, effective } chacun null ou { date, aVerifier }
 */
function datesDeLaLigne(l, aujourdhui) {
  var g = lireDateEssai(l.creneau, l.dateDemande, aujourdhui);
  var n = lireDateEssai(l.nouvelleDate, l.dateDemande, aujourdhui);
  return { g: g, n: n, effective: n || g };
}

function estAnnulee(l) {
  var nVide = l.nouvelleDate === '' || l.nouvelleDate === null || l.nouvelleDate === undefined;
  return (estOui(l.reporte) && nVide) || texteSimple(l.remarques).indexOf('annul') >= 0;
}

/**
 * Où ranger cette ligne pour le jour demandé ?
 * @return 'attendu', 'annule', 'reporte' ou null (pas concernée)
 */
function classerLigne(l, jour, aujourdhui) {
  var d = datesDeLaLigne(l, aujourdhui);
  var cleEff = d.effective ? cleJour(d.effective.date) : '';
  if (cleEff === jour) return estAnnulee(l) ? 'annule' : 'attendu';
  if (d.g && d.n && cleJour(d.g.date) === jour) return 'reporte';
  return null;
}

/** Une ligne vide ou l'exemple fictif ne compte pas. */
function ligneUtile(l) {
  return l.numeroLigne >= PREMIERE_LIGNE_DONNEES && !!(l.prenom || l.telephone || l.email);
}

/** Fiche envoyée au téléphone pour afficher une carte. */
function carte(l, jour, aujourdhui) {
  var d = datesDeLaLigne(l, aujourdhui);
  var h = estDateValide(l.dateEssai) ? cleJour(l.dateEssai) : '';
  var venu = texteSimple(l.venu);
  var etat = 'attendu';
  if (venu === 'oui' && h === jour) etat = 'present';
  else if (venu === 'non') etat = 'absent';
  return {
    cle: { tel: normaliserTelephone(l.telephone), email: normaliserEmail(l.email), prenom: l.prenom },
    prenom: l.prenom,
    nom: l.nom,
    telephone: formaterTelephone(l.telephone),
    email: normaliserEmail(l.email),
    origine: String(l.origine || ''),
    etat: etat,
    spontane: texteSimple(l.remarques).indexOf('sans pre-inscription') >= 0,
    dateAVerifier: !!(d.effective && d.effective.aVerifier),
    nouvelleDate: d.n ? cleJour(d.n.date) : '',
    badges: {
      rappelEnvoye: rappelEnvoye(l.smsRappel),
      reponseOui: texteSimple(l.reponseRappel) === 'oui',
      reporteIci: !!(d.n && cleJour(d.n.date) === jour),
      dejaVenu: venu === 'oui' && h !== '' && h !== jour
    },
    dateDemande: estDateValide(l.dateDemande) ? cleJour(l.dateDemande) : '',
    champs: {
      declencheur: String(l.declencheur || ''), canal: String(l.canal || ''),
      inscrit: String(l.inscrit || ''), motif: String(l.motif || ''),
      dateInscription: estDateValide(l.dateInscription) ? cleJour(l.dateInscription) : '',
      reponseRappel: String(l.reponseRappel || ''), reporte: String(l.reporte || '')
    }
  };
}

function trierParPrenom(cartes) {
  return cartes.sort(function (a, b) {
    return a.prenom.localeCompare(b.prenom, 'fr', { sensitivity: 'base' }) ||
      a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' });
  });
}

/**
 * Liste du cours d'un jour : attendus, annulés, reportés ailleurs.
 * @param lignes  objets issus de lireLigne
 * @param jour    clé « 2026-09-29 »
 */
function coursDuJour(lignes, jour, aujourdhui) {
  var res = { jour: jour, attendus: [], annules: [], reportes: [] };
  lignes.forEach(function (l) {
    if (!ligneUtile(l)) return;
    var classe = classerLigne(l, jour, aujourdhui);
    if (classe === 'attendu') res.attendus.push(carte(l, jour, aujourdhui));
    else if (classe === 'annule') res.annules.push(carte(l, jour, aujourdhui));
    else if (classe === 'reporte') res.reportes.push(carte(l, jour, aujourdhui));
  });
  trierParPrenom(res.attendus); trierParPrenom(res.annules); trierParPrenom(res.reportes);
  return res;
}

/** Toutes les dates qui ont au moins un attendu, triées. */
function datesDeCours(lignes, aujourdhui) {
  var vues = {};
  lignes.forEach(function (l) {
    if (!ligneUtile(l) || estAnnulee(l)) return;
    var d = datesDeLaLigne(l, aujourdhui).effective;
    if (d) vues[cleJour(d.date)] = true;
  });
  return Object.keys(vues).sort();
}

/* ---------- Retrouver la bonne ligne avant d'écrire ---------- */

/**
 * Retrouve LA ligne d'une personne, sans jamais se fier à un numéro de ligne
 * mémorisé (le classeur est retrié chaque jour).
 * Clé : téléphone, à défaut email, avec le prénom en contrôle.
 * Si plusieurs lignes restent, le jour du cours sert à départager.
 *
 * @param cle { tel, email, prenom, jour }
 * @return { ok: true, ligne } ou { ok: false, code, message }
 */
function trouverLigne(lignes, cle, aujourdhui) {
  var tel = normaliserTelephone(cle.tel);
  var email = normaliserEmail(cle.email);
  var utiles = lignes.filter(ligneUtile);
  var candidats = [];
  if (tel) candidats = utiles.filter(function (l) { return normaliserTelephone(l.telephone) === tel; });
  if (!candidats.length && email) {
    candidats = utiles.filter(function (l) { return normaliserEmail(l.email) === email; });
  }
  if (!candidats.length) {
    return { ok: false, code: 'introuvable',
      message: 'Personne introuvable dans le suivi (ni ce téléphone ni cet email). Rien n\'a été écrit.' };
  }
  var memePrenom = candidats.filter(function (l) { return prenomsEgaux(l.prenom, cle.prenom); });
  if (!memePrenom.length) {
    return { ok: false, code: 'prenom',
      message: 'Ce téléphone correspond à ' + candidats.map(function (l) { return l.prenom || '(sans prénom)'; }).join(', ') +
        ', pas à ' + cle.prenom + '. Rien n\'a été écrit.' };
  }
  if (memePrenom.length > 1 && cle.jour) {
    var ceJour = memePrenom.filter(function (l) {
      var d = datesDeLaLigne(l, aujourdhui).effective;
      return d && cleJour(d.date) === cle.jour;
    });
    if (ceJour.length === 1) memePrenom = ceJour;
  }
  if (memePrenom.length > 1) {
    return { ok: false, code: 'plusieurs',
      message: cle.prenom + ' apparaît sur ' + memePrenom.length + ' lignes (lignes ' +
        memePrenom.map(function (l) { return l.numeroLigne; }).join(', ') +
        '). Supprime le doublon dans le classeur puis réessaie. Rien n\'a été écrit.' };
  }
  return { ok: true, ligne: memePrenom[0] };
}

/** Pour un visiteur sans pré-inscription : est-il déjà dans le suivi ? */
function chercherDoublons(lignes, tel, email) {
  var t = normaliserTelephone(tel), e = normaliserEmail(email);
  return lignes.filter(function (l) {
    if (!ligneUtile(l)) return false;
    return (t && normaliserTelephone(l.telephone) === t) || (e && normaliserEmail(l.email) === e);
  });
}

/* Pour les tests sur le Mac (ignoré par Google Apps Script) */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    COL: COL, NB_COLONNES: NB_COLONNES, PREMIERE_LIGNE_DONNEES: PREMIERE_LIGNE_DONNEES,
    texteSimple: texteSimple, prenomsEgaux: prenomsEgaux,
    normaliserTelephone: normaliserTelephone, formaterTelephone: formaterTelephone,
    normaliserEmail: normaliserEmail, estDateValide: estDateValide, cleJour: cleJour,
    dateDepuisCle: dateDepuisCle, formaterCreneau: formaterCreneau, formaterJourMois: formaterJourMois,
    lireDateEssai: lireDateEssai, lireLigne: lireLigne, estOui: estOui, estAnnulee: estAnnulee,
    classerLigne: classerLigne, coursDuJour: coursDuJour, datesDeCours: datesDeCours,
    trouverLigne: trouverLigne, chercherDoublons: chercherDoublons
  };
}
