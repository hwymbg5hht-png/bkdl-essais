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
 * Règles d'écriture (ne jamais les assouplir) :
 *   - la ligne d'une personne est retrouvée à chaque écriture par téléphone,
 *     à défaut email, avec le prénom en contrôle (le classeur est retrié chaque jour)
 *   - un verrou empêche deux écritures en même temps
 *   - écriture cellule par cellule, seulement H, O et AB sur une ligne existante
 *   - G, P, Q, R ne sont jamais touchées sur une ligne existante
 *   - un visiteur sans pré-inscription crée une ligne neuve en fin d'onglet
 *   - chaque changement est noté dans l'onglet « Journal app »
 */

var VERSION = '3';
var ONGLET_JOURNAL = 'Journal app';
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
    case 'pointer': return actionPointer(demande);
    case 'retirer': return actionRetirer(demande);
    case 'cloturer': return actionCloturer(demande);
    case 'annuler': return actionAnnuler(demande);
    case 'visiteur': return actionVisiteur(demande);
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

/* ---------- Écritures ---------- */

/**
 * Pointe une personne présente : H = jour du cours, O = Oui, trace en AB.
 * demande : { cle: { tel, email, prenom }, jour }
 */
function actionPointer(demande) {
  var jour = jourValide(demande.jour);
  return avecVerrou(function (onglet, lignes) {
    var l = ligneDe(lignes, demande.cle, jour);
    var dateCours = dateDepuisCle(jour);
    var hActuel = estDateValide(l.dateEssai) ? cleJour(l.dateEssai) : '';
    if (estOui(l.venu) && hActuel === jour) {
      return { ok: true, message: l.prenom + ' était déjà pointé présent.', changements: [] };
    }
    var trace = 'Pointé présent via app le ' + horodatage();
    if (l.dateEssai !== '' && hActuel !== jour) trace += ' (H valait ' + texteCellule(l.dateEssai) + ')';
    var changements = ecrire(onglet, l, jour, 'pointer', [
      [COL.DATE_ESSAI, dateCours],
      [COL.VENU, 'Oui'],
      [COL.REMARQUES, ajouterRemarque(l.remarques, trace)]
    ]);
    return { ok: true, message: l.prenom + ' pointé présent.', changements: changements };
  });
}

/** Retire une présence pointée par erreur : O vidé, H vidé s'il vaut le jour du cours. */
function actionRetirer(demande) {
  var jour = jourValide(demande.jour);
  return avecVerrou(function (onglet, lignes) {
    var l = ligneDe(lignes, demande.cle, jour);
    var hActuel = estDateValide(l.dateEssai) ? cleJour(l.dateEssai) : '';
    var cellules = [[COL.VENU, '']];
    if (hActuel === jour) cellules.unshift([COL.DATE_ESSAI, '']);
    cellules.push([COL.REMARQUES, ajouterRemarque(l.remarques, 'Présence retirée via app le ' + horodatage())]);
    var changements = ecrire(onglet, l, jour, 'retirer', cellules);
    return { ok: true, message: 'Présence de ' + l.prenom + ' retirée.', changements: changements };
  });
}

/**
 * Clôture le cours : O = Non pour chaque attendu du jour non pointé.
 * Jamais pour les annulés, les reportés ailleurs, ni si O est déjà rempli.
 */
function actionCloturer(demande) {
  var jour = jourValide(demande.jour);
  var aujourdhui = aMinuit(new Date());
  return avecVerrou(function (onglet, lignes) {
    var changements = [];
    var trace = 'Absent au cours du ' + formaterJourMois(dateDepuisCle(jour)) +
      ', clôture via app le ' + horodatage();
    lignes.forEach(function (l) {
      if (!ligneUtile(l)) return;
      if (classerLigne(l, jour, aujourdhui) !== 'attendu') return;
      if (texteSimple(l.venu) !== '') return;
      changements = changements.concat(ecrire(onglet, l, jour, 'cloturer', [
        [COL.VENU, 'Non'],
        [COL.REMARQUES, ajouterRemarque(l.remarques, trace)]
      ]));
    });
    var cours = coursDuJour(lireToutesLesLignes(onglet), jour, aujourdhui);
    return {
      ok: true,
      changements: changements,
      cours: cours,
      message: changements.length ? 'Cours clôturé.' : 'Rien à clôturer : tout le monde est déjà pointé.'
    };
  });
}

/**
 * Annule une action récente : remet exactement les valeurs d'avant,
 * seulement si personne n'a modifié ces cellules entre-temps.
 * demande.changements : la liste renvoyée par l'action à annuler
 */
function actionAnnuler(demande) {
  var liste = demande.changements || [];
  if (!liste.length) return { ok: true, message: 'Rien à annuler.', changements: [] };
  return avecVerrou(function (onglet, lignes) {
    // 1. On retrouve chaque ligne et on vérifie que rien n'a bougé
    var aRemettre = liste.map(function (c) {
      var l = ligneDe(lignes, c.cle, c.jour);
      var formule = c.apres && typeof c.apres === 'object' && c.apres.formule;
      var actuel = serialiser(onglet.getRange(l.numeroLigne, c.col).getValue());
      if (!formule && JSON.stringify(actuel) !== JSON.stringify(c.apres)) {
        throw new Error('Impossible d\'annuler : la ligne de ' + l.prenom +
          ' a été modifiée entre-temps. Corrige directement dans le classeur.');
      }
      verifierLigneInchangee(onglet, l);
      return { l: l, c: c };
    });
    // 2. On remet les anciennes valeurs, cellule par cellule
    aRemettre.forEach(function (x) {
      var formule = x.c.apres && typeof x.c.apres === 'object' && x.c.apres.formule;
      if (formule) {
        onglet.getRange(x.l.numeroLigne, x.c.col).setValue('');
        journaliser('annuler', x.l, x.c.col, 'formule du délai', '');
        return;
      }
      ecrireCellule(onglet, x.l.numeroLigne, x.c.col, deserialiser(x.c.avant));
      journaliser('annuler', x.l, x.c.col, x.c.apres, x.c.avant);
    });
    return { ok: true, message: 'Annulé.', changements: [] };
  });
}

/* ---------- Visiteur sans pré-inscription ---------- */

/**
 * Enregistre une personne venue sans pré-inscription, déjà présente.
 * demande : { prenom, nom, tel, email, origine, seize: 'Oui'|'Non', jour, forcer }
 *
 * Si le téléphone ou l'email existe déjà dans le suivi, rien n'est créé :
 * on renvoie les lignes trouvées pour proposer de pointer la personne
 * existante. forcer = true crée quand même (deux personnes, un seul téléphone).
 */
function actionVisiteur(demande) {
  var jour = jourValide(demande.jour);
  var prenom = String(demande.prenom || '').trim();
  var nom = String(demande.nom || '').trim();
  var tel = normaliserTelephone(demande.tel);
  var email = normaliserEmail(demande.email);
  var origine = String(demande.origine || '').trim();
  if (!prenom) throw new Error('Le prénom est obligatoire.');
  if (!tel) throw new Error('Le téléphone doit avoir 10 chiffres.');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('L\'email n\'est pas valable.');
  var classeur = ouvrirClasseur();
  if (lireListes(classeur).Origine.indexOf(origine) < 0) {
    throw new Error('Choisis comment la personne a connu le club dans la liste.');
  }
  if (demande.seize !== 'Oui' && demande.seize !== 'Non') throw new Error('Précise si la personne a 16 ans ou plus.');

  return avecVerrou(function (onglet, lignes) {
    // 1. Déjà dans le suivi ?
    var doublons = chercherDoublons(lignes, tel, email);
    if (doublons.length && !demande.forcer) {
      return {
        ok: true,
        cree: false,
        doublons: doublons.map(function (l) {
          var d = datesDeLaLigne(l, aMinuit(new Date())).effective;
          return {
            cle: { tel: normaliserTelephone(l.telephone), email: normaliserEmail(l.email), prenom: l.prenom },
            prenom: l.prenom,
            nom: l.nom,
            dateDemande: estDateValide(l.dateDemande) ? formaterJourMois(l.dateDemande) : '',
            dateEssai: d ? cleJour(d.date) : '',
            memeTelephone: normaliserTelephone(l.telephone) === tel
          };
        })
      };
    }

    // 2. Première ligne libre après la dernière ligne remplie
    var numero = premiereLigneLibre(onglet, lignes);
    var dateCours = dateDepuisCle(jour);
    var trace = 'Venu sans pré-inscription, saisi via app le ' + horodatage() +
      (demande.seize === 'Non' ? ', moins de 16 ans : autorisation parentale papier à faire signer' : '');
    var l = { numeroLigne: numero, prenom: prenom, telephone: tel, email: email };

    // 3. Écriture cellule par cellule (Q et R restent vides)
    var cellules = [
      [COL.DATE_DEMANDE, dateCours],
      [COL.PRENOM, prenom],
      [COL.NOM, nom],
      [COL.TELEPHONE, formaterTelephone(tel)],
      [COL.EMAIL, email],
      [COL.CRENEAU, formaterCreneau(dateCours)],
      [COL.DATE_ESSAI, dateCours],
      [COL.VENU, 'Oui'],
      [COL.ORIGINE, origine],
      [COL.REMARQUES, trace]
    ];
    var cle = { tel: tel, email: email, prenom: prenom };
    var changements = [];
    cellules.forEach(function (x) {
      if (x[1] === '') return;
      var cellule = onglet.getRange(numero, x[0]);
      if (x[0] === COL.TELEPHONE || x[0] === COL.CRENEAU) cellule.setNumberFormat('@'); // texte : garde le 0 et la date écrite
      ecrireCellule(onglet, numero, x[0], x[1]);
      journaliser('visiteur', l, x[0], '', serialiser(x[1]));
      changements.push({ cle: cle, jour: jour, col: x[0], avant: '', apres: serialiser(x[1]) });
    });
    // Formule du délai en I, seulement sur cette ligne neuve
    onglet.getRange(numero, COL.DELAI).setFormula(
      '=IF(AND(B' + numero + '<>"",H' + numero + '<>""),H' + numero + '-B' + numero + ',"")');
    journaliser('visiteur', l, COL.DELAI, '', 'formule du délai');
    changements.push({ cle: cle, jour: jour, col: COL.DELAI, avant: '', apres: { formule: true } });

    return {
      ok: true,
      cree: true,
      message: prenom + ' ajouté et pointé présent.',
      changements: changements
    };
  });
}

/**
 * Ligne qui suit la dernière ligne où B, C ou E est rempli.
 * Par sécurité, on descend tant que B à F ne sont pas vides.
 */
function premiereLigneLibre(onglet, lignes) {
  var derniere = 2;
  lignes.forEach(function (l) {
    if (l.dateDemande !== '' || l.prenom || l.telephone !== '') derniere = Math.max(derniere, l.numeroLigne);
  });
  for (var n = derniere + 1; n < derniere + 50; n++) {
    var vides = onglet.getRange(n, COL.DATE_DEMANDE, 1, 5).getValues()[0].every(function (v) { return v === ''; });
    if (vides) return n;
  }
  throw new Error('Impossible de trouver une ligne libre en fin d\'onglet.');
}

/* ---------- Outils d'écriture ---------- */

/**
 * Relit le classeur sous verrou puis exécute l'écriture.
 * Le verrou empêche deux écritures simultanées (deux téléphones, deux clics).
 */
function avecVerrou(fn) {
  var verrou = LockService.getScriptLock();
  if (!verrou.tryLock(15000)) throw new Error('Le classeur est occupé, réessaie dans quelques secondes.');
  try {
    var onglet = ongletSuivi(ouvrirClasseur());
    return fn(onglet, lireToutesLesLignes(onglet));
  } finally {
    SpreadsheetApp.flush();
    verrou.releaseLock();
  }
}

function ligneDe(lignes, cle, jour) {
  if (!cle || !cle.prenom) throw new Error('Personne non précisée.');
  var r = trouverLigne(lignes, { tel: cle.tel, email: cle.email, prenom: cle.prenom, jour: jour }, aMinuit(new Date()));
  if (!r.ok) throw new Error(r.message);
  return r.ligne;
}

function jourValide(jour) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(jour || '')) throw new Error('Date du cours manquante.');
  return jour;
}

/**
 * Écrit quelques cellules d'une ligne, une par une, et renvoie
 * de quoi annuler : [{ cle, jour, col, avant, apres }].
 */
function ecrire(onglet, l, jour, action, cellules) {
  verifierLigneInchangee(onglet, l);
  var cle = { tel: normaliserTelephone(l.telephone), email: normaliserEmail(l.email), prenom: l.prenom };
  var changements = [];
  cellules.forEach(function (x) {
    var col = x[0], valeur = x[1];
    if (colonnesInterdites().indexOf(col) >= 0) throw new Error('Écriture interdite en colonne ' + col);
    var avant = onglet.getRange(l.numeroLigne, col).getValue();
    if (JSON.stringify(serialiser(avant)) === JSON.stringify(serialiser(valeur))) return;
    ecrireCellule(onglet, l.numeroLigne, col, valeur);
    journaliser(action, l, col, serialiser(avant), serialiser(valeur));
    changements.push({ cle: cle, jour: jour, col: col, avant: serialiser(avant), apres: serialiser(valeur) });
  });
  return changements;
}

/**
 * Colonnes que l'app ne doit jamais modifier sur une ligne existante.
 * (Une fonction et pas une variable : le fichier Logique, qui définit COL,
 * est chargé après celui-ci.)
 */
function colonnesInterdites() {
  return [COL.N, COL.CRENEAU, COL.DELAI, COL.ORIGINE, COL.UTM_SOURCE, COL.UTM_CAMPAGNE];
}

/** Une seule cellule, jamais un bloc. Les dates sont affichées en j/m/aaaa. */
function ecrireCellule(onglet, ligne, col, valeur) {
  var cellule = onglet.getRange(ligne, col);
  if (estDateValide(valeur)) cellule.setNumberFormat('d/m/yyyy');
  cellule.setValue(valeur);
}

/**
 * Dernier contrôle juste avant d'écrire : la ligne a-t-elle bougé
 * depuis la lecture (retri par une automatisation) ?
 */
function verifierLigneInchangee(onglet, l) {
  var v = onglet.getRange(l.numeroLigne, COL.PRENOM, 1, 4).getValues()[0]; // C à F
  var memeTel = normaliserTelephone(v[2]) === normaliserTelephone(l.telephone);
  var memeEmail = normaliserEmail(v[3]) === normaliserEmail(l.email);
  if (!prenomsEgaux(v[0], l.prenom) || !memeTel || !memeEmail) {
    throw new Error('Le classeur vient d\'être retrié. Rien n\'a été écrit, réessaie.');
  }
}

/** Ajoute une trace à la fin des remarques, sans jamais effacer l'existant. */
function ajouterRemarque(existant, trace) {
  var t = String(existant || '').trim();
  return t ? t + ' | ' + trace : trace;
}

function horodatage() {
  return Utilities.formatDate(new Date(), 'Europe/Paris', "dd/MM HH'h'mm");
}

function texteCellule(v) {
  return estDateValide(v) ? Utilities.formatDate(v, 'Europe/Paris', 'd/M/yyyy') : String(v);
}

/** Valeur de cellule transportable jusqu'au téléphone et retour. */
function serialiser(v) {
  if (estDateValide(v)) return { date: cleJour(v) };
  return v === undefined || v === null ? '' : v;
}

function deserialiser(v) {
  return v && typeof v === 'object' && v.date ? dateDepuisCle(v.date) : v;
}

/* ---------- Journal ---------- */

var ENTETES_JOURNAL = ['Horodatage', 'Action', 'Prénom', 'Téléphone', 'Email',
  'Ligne au moment de l\'écriture', 'Colonne', 'Avant', 'Après'];

/** Une ligne par cellule modifiée, pour pouvoir réparer une erreur à la main. */
function journaliser(action, l, col, avant, apres) {
  var classeur = ouvrirClasseur();
  var journal = classeur.getSheetByName(ONGLET_JOURNAL);
  if (!journal) {
    journal = classeur.insertSheet(ONGLET_JOURNAL);
    journal.appendRow(ENTETES_JOURNAL);
    journal.setFrozenRows(1);
  }
  journal.appendRow([
    Utilities.formatDate(new Date(), 'Europe/Paris', 'dd/MM/yyyy HH:mm:ss'),
    action, l.prenom, "'" + formaterTelephone(l.telephone), normaliserEmail(l.email),
    l.numeroLigne, lettreColonne(col), texteJournal(avant), texteJournal(apres)
  ]);
}

function texteJournal(v) {
  if (v && typeof v === 'object') return v.date || (v.formule ? 'formule du délai' : '');
  return String(v);
}

function lettreColonne(col) {
  var s = '';
  while (col > 0) { var r = (col - 1) % 26; s = String.fromCharCode(65 + r) + s; col = Math.floor((col - 1) / 26); }
  return s;
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

var classeurOuvert = null; // ouvert une seule fois par demande

function ouvrirClasseur() {
  if (classeurOuvert) return classeurOuvert;
  var id = PropertiesService.getScriptProperties().getProperty('ID_CLASSEUR');
  if (!id) throw new Error('L\'identifiant du classeur n\'est pas défini dans les Propriétés du script.');
  try {
    classeurOuvert = SpreadsheetApp.openById(id.trim());
    return classeurOuvert;
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
