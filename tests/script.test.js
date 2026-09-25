/**
 * Tests du script Google (Code.gs + Logique.gs) sur un faux classeur.
 * Les services Google sont imités, ce qui permet de vérifier les écritures
 * sans toucher au vrai classeur ni à la copie.
 * Lancer depuis le dossier du projet : npm test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const RACINE = path.join(__dirname, '..');
const D = (a, m, j) => new Date(a, m - 1, j);
const JOUR = '2026-09-29';
const PIN = '246810';

/* ---------- Faux classeur ---------- */

function fauxOnglet(nom, lignes) {
  const o = {
    nom,
    lignes, // tableau de tableaux, ligne 1 = lignes[0]
    formats: {},
    getLastRow: () => o.lignes.length,
    getRange(r, c, nr = 1, nc = 1) {
      return {
        getValue: () => { const l = o.lignes[r - 1]; return l && l[c - 1] !== undefined ? l[c - 1] : ''; },
        getValues: () => Array.from({ length: nr }, (_, i) =>
          Array.from({ length: nc }, (_, j) => { const l = o.lignes[r - 1 + i]; return l && l[c - 1 + j] !== undefined ? l[c - 1 + j] : ''; })),
        setValue: (v) => {
          if (nr !== 1 || nc !== 1) throw new Error('écriture de bloc interdite');
          while (o.lignes.length < r) o.lignes.push([]);
          o.lignes[r - 1][c - 1] = v;
        },
        setNumberFormat: (f) => { o.formats[r + ',' + c] = f; },
        setFormula: (f) => {
          while (o.lignes.length < r) o.lignes.push([]);
          o.lignes[r - 1][c - 1] = f;
        },
        getDisplayValues: () => o.getRange(r, c, nr, nc).getValues().map((l) => l.map(String))
      };
    },
    getDataRange: () => o.getRange(1, 1, o.lignes.length, Math.max(...o.lignes.map((l) => l.length))),
    appendRow: (v) => { o.lignes.push(v.slice()); },
    setFrozenRows: () => {}
  };
  return o;
}

/** Une ligne A à AB à partir de quelques colonnes nommées. */
function ligne(champs, COL) {
  const v = new Array(28).fill('');
  for (const [nom, val] of Object.entries(champs)) v[COL[nom] - 1] = val;
  return v;
}

function monter(lignesDonnees) {
  const onglets = {};
  const classeur = {
    getName: () => 'TEST app pointage',
    getSheetByName: (n) => onglets[n] || null,
    insertSheet: (n) => (onglets[n] = fauxOnglet(n, [])),
    getRangeByName: () => null
  };
  const cache = {};
  const ctx = {
    console,
    Logger: { log: () => {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => ({ PIN, ID_CLASSEUR: 'x' })[k] }) },
    CacheService: { getScriptCache: () => ({ get: (k) => cache[k], put: (k, v) => { cache[k] = v; }, remove: (k) => { delete cache[k]; } }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    SpreadsheetApp: { openById: () => classeur, flush: () => {} },
    Session: { getScriptTimeZone: () => 'Europe/Paris' },
    Utilities: { formatDate: (d, tz, f) => (f === 'd/M/yyyy' ? d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear() : '29/09 20h04') },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ texte: t, setMimeType() { return this; } }) }
  };
  vm.createContext(ctx);
  // Même ordre que dans Apps Script : Code d'abord, Logique ensuite
  vm.runInContext(fs.readFileSync(path.join(RACINE, 'apps-script', 'Code.gs'), 'utf8'), ctx, { filename: 'Code.gs' });
  vm.runInContext(fs.readFileSync(path.join(RACINE, 'apps-script', 'Logique.gs'), 'utf8'), ctx, { filename: 'Logique.gs' });
  const COL = vm.runInContext('COL', ctx);
  const suivi = fauxOnglet('Suivi des demandes', [['N', 'Date de la demande', 'Prenom']].concat(lignesDonnees(COL)));
  onglets['Suivi des demandes'] = suivi;
  const appel = (corps) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(Object.assign({ pin: PIN }, corps)) } }).texte);
  return { ctx, COL, suivi, onglets, appel, cellule: (r, nom) => suivi.lignes[r - 1][COL[nom] - 1] };
}

function jeu(COL) {
  return [
    ligne({ PRENOM: 'Candice', TELEPHONE: '06 00 00 00 00', CRENEAU: 'mardi 29 septembre', DATE_DEMANDE: D(2026, 9, 1) }, COL),
    ligne({ N: 1, PRENOM: 'Zoé', TELEPHONE: '06 11 11 11 11', CRENEAU: 'mardi 29 septembre', DATE_DEMANDE: D(2026, 9, 10),
      ORIGINE: 'Une recherche Google', UTM_SOURCE: 'google', UTM_CAMPAGNE: 'rentree', REMARQUES: 'Vient avec une amie' }, COL),
    ligne({ N: 2, PRENOM: 'Léa', TELEPHONE: '06 66 66 66 66', CRENEAU: 'mardi 29 septembre', DATE_DEMANDE: D(2026, 9, 12) }, COL),
    ligne({ N: 3, PRENOM: 'Hugo', TELEPHONE: '+33 6 66 66 66 66', CRENEAU: '29/9/2026', DATE_DEMANDE: D(2026, 9, 12) }, COL),
    ligne({ N: 4, PRENOM: 'Chloé', TELEPHONE: '06 44 44 44 44', CRENEAU: 'mardi 29 septembre', REPORTE: 'Oui', DATE_DEMANDE: D(2026, 9, 5) }, COL),
    ligne({ N: 5, PRENOM: 'Bruno', TELEPHONE: '06 33 33 33 33', CRENEAU: 'mardi 29 septembre', REPORTE: 'Oui', NOUVELLE_DATE: '6/10/2026', DATE_DEMANDE: D(2026, 9, 5) }, COL),
    ligne({ N: 6, PRENOM: 'Farid', TELEPHONE: '06 88 88 88 88', CRENEAU: 'mardi 29 septembre', DATE_DEMANDE: D(2026, 9, 5), VENU: 'Non' }, COL),
    ligne({ N: 7, PRENOM: 'Ines', TELEPHONE: '06 12 12 12 12', CRENEAU: 'mardi 29 septembre', DATE_DEMANDE: D(2026, 9, 5),
      DATE_ESSAI: D(2026, 9, 22) }, COL)
  ];
}

const cleDe = (reponse, prenom) => reponse.cours.attendus.find((c) => c.prenom === prenom).cle;

/* ---------- Tests ---------- */

test('script : Code chargé avant Logique sans erreur, lecture du cours', () => {
  const { appel } = monter(jeu);
  const r = appel({ action: 'cours', jour: JOUR });
  assert.equal(r.ok, true, r.message);
  assert.deepEqual(r.cours.attendus.map((c) => c.prenom), ['Farid', 'Hugo', 'Ines', 'Léa', 'Zoé']);
});

test('pointer : H, O et AB écrits sur la bonne ligne, G P Q R intacts', () => {
  const { appel, cellule, suivi } = monter(jeu);
  const cle = cleDe(appel({ action: 'cours', jour: JOUR }), 'Zoé');
  const r = appel({ action: 'pointer', cle, jour: JOUR });
  assert.equal(r.ok, true, r.message);
  assert.equal(cellule(3, 'VENU'), 'Oui');
  assert.equal(cellule(3, 'DATE_ESSAI').getTime(), D(2026, 9, 29).getTime());
  assert.equal(suivi.formats['3,8'], 'd/m/yyyy');
  assert.equal(cellule(3, 'REMARQUES'), 'Vient avec une amie | Pointé présent via app le 29/09 20h04');
  assert.equal(cellule(3, 'CRENEAU'), 'mardi 29 septembre');
  assert.equal(cellule(3, 'ORIGINE'), 'Une recherche Google');
  assert.equal(cellule(3, 'UTM_SOURCE'), 'google');
  assert.equal(cellule(3, 'UTM_CAMPAGNE'), 'rentree');
  assert.equal(r.changements.length, 3);
});

test('pointer : retri entre la lecture et le pointage, l\'écriture suit la personne', () => {
  const { appel, suivi, COL } = monter(jeu);
  const cle = cleDe(appel({ action: 'cours', jour: JOUR }), 'Zoé');
  // L'automatisation retrie : on inverse toutes les lignes de données
  const entete = suivi.lignes.slice(0, 2);
  suivi.lignes = entete.concat(suivi.lignes.slice(2).reverse());
  const rangZoe = suivi.lignes.findIndex((l) => l[COL.PRENOM - 1] === 'Zoé') + 1;
  assert.notEqual(rangZoe, 3);
  const r = appel({ action: 'pointer', cle, jour: JOUR });
  assert.equal(r.ok, true, r.message);
  assert.equal(suivi.lignes[rangZoe - 1][COL.VENU - 1], 'Oui');
  const autres = suivi.lignes.filter((l, i) => i + 1 !== rangZoe && l[COL.VENU - 1] === 'Oui');
  assert.equal(autres.length, 0);
});

test('pointer : même téléphone, seule la bonne personne est pointée', () => {
  const { appel, cellule } = monter(jeu);
  const cle = cleDe(appel({ action: 'cours', jour: JOUR }), 'Hugo');
  appel({ action: 'pointer', cle, jour: JOUR });
  assert.equal(cellule(5, 'VENU'), 'Oui');
  assert.equal(cellule(4, 'VENU'), '');
});

test('pointer : prénom qui ne correspond pas, rien n\'est écrit', () => {
  const { appel, suivi } = monter(jeu);
  const avant = JSON.stringify(suivi.lignes);
  const r = appel({ action: 'pointer', cle: { tel: '0611111111', prenom: 'Paul' }, jour: JOUR });
  assert.equal(r.ok, false);
  assert.match(r.message, /pas à Paul/);
  assert.equal(JSON.stringify(suivi.lignes), avant);
});

test('pointer : ancienne date en H mentionnée dans la trace', () => {
  const { appel, cellule } = monter(jeu);
  const cle = cleDe(appel({ action: 'cours', jour: JOUR }), 'Ines');
  appel({ action: 'pointer', cle, jour: JOUR });
  assert.match(cellule(9, 'REMARQUES'), /H valait 22\/9\/2026/);
});

test('pointer deux fois ne change rien la seconde fois', () => {
  const { appel } = monter(jeu);
  const cle = cleDe(appel({ action: 'cours', jour: JOUR }), 'Zoé');
  appel({ action: 'pointer', cle, jour: JOUR });
  const r = appel({ action: 'pointer', cle, jour: JOUR });
  assert.equal(r.ok, true);
  assert.equal(r.changements.length, 0);
});

test('annuler : remet exactement les valeurs précédentes', () => {
  const { appel, cellule } = monter(jeu);
  const cle = cleDe(appel({ action: 'cours', jour: JOUR }), 'Zoé');
  const r = appel({ action: 'pointer', cle, jour: JOUR });
  const a = appel({ action: 'annuler', changements: r.changements });
  assert.equal(a.ok, true, a.message);
  assert.equal(cellule(3, 'VENU'), '');
  assert.equal(cellule(3, 'DATE_ESSAI'), '');
  assert.equal(cellule(3, 'REMARQUES'), 'Vient avec une amie');
});

test('annuler : refusé si la cellule a été modifiée entre-temps', () => {
  const { appel, suivi, COL } = monter(jeu);
  const cle = cleDe(appel({ action: 'cours', jour: JOUR }), 'Zoé');
  const r = appel({ action: 'pointer', cle, jour: JOUR });
  suivi.lignes[2][COL.REMARQUES - 1] += ' | note ajoutée à la main';
  const a = appel({ action: 'annuler', changements: r.changements });
  assert.equal(a.ok, false);
  assert.equal(suivi.lignes[2][COL.VENU - 1], 'Oui');
});

test('retirer : efface la présence du jour avec une trace', () => {
  const { appel, cellule } = monter(jeu);
  const cle = cleDe(appel({ action: 'cours', jour: JOUR }), 'Zoé');
  appel({ action: 'pointer', cle, jour: JOUR });
  const r = appel({ action: 'retirer', cle, jour: JOUR });
  assert.equal(r.ok, true, r.message);
  assert.equal(cellule(3, 'VENU'), '');
  assert.equal(cellule(3, 'DATE_ESSAI'), '');
  assert.match(cellule(3, 'REMARQUES'), /Présence retirée via app/);
});

test('clôturer : Non seulement pour les attendus non pointés', () => {
  const { appel, cellule } = monter(jeu);
  const cle = cleDe(appel({ action: 'cours', jour: JOUR }), 'Zoé');
  appel({ action: 'pointer', cle, jour: JOUR });
  const r = appel({ action: 'cloturer', jour: JOUR });
  assert.equal(r.ok, true, r.message);
  assert.equal(cellule(3, 'VENU'), 'Oui');   // Zoé pointée
  assert.equal(cellule(4, 'VENU'), 'Non');   // Léa
  assert.equal(cellule(5, 'VENU'), 'Non');   // Hugo
  assert.equal(cellule(6, 'VENU'), '');      // Chloé annulée
  assert.equal(cellule(7, 'VENU'), '');      // Bruno reporté ailleurs
  assert.equal(cellule(8, 'VENU'), 'Non');   // Farid déjà à Non, inchangé
  assert.equal(cellule(8, 'REMARQUES'), ''); // pas de trace inutile
  assert.equal(cellule(2, 'VENU'), '');      // exemple fictif jamais touché
  assert.match(cellule(4, 'REMARQUES'), /Absent au cours du 29\/09/);
  assert.equal(r.cours.attendus.filter((c) => c.etat === 'absent').length, 4); // Léa, Hugo, Farid, Ines
});

test('clôturer puis annuler : tout revient comme avant', () => {
  const { appel, suivi } = monter(jeu);
  const avant = JSON.stringify(suivi.lignes);
  const r = appel({ action: 'cloturer', jour: JOUR });
  assert.ok(r.changements.length > 0);
  const a = appel({ action: 'annuler', changements: r.changements });
  assert.equal(a.ok, true, a.message);
  assert.equal(JSON.stringify(suivi.lignes), avant);
});

test('journal : onglet créé, une ligne par cellule modifiée', () => {
  const { appel, onglets } = monter(jeu);
  const cle = cleDe(appel({ action: 'cours', jour: JOUR }), 'Zoé');
  appel({ action: 'pointer', cle, jour: JOUR });
  const j = onglets['Journal app'];
  assert.ok(j);
  assert.equal(j.lignes[0][0], 'Horodatage');
  assert.equal(JSON.stringify(j.lignes.slice(1).map((l) => l[6])), '["H","O","AB"]');
  assert.equal(JSON.stringify(j.lignes[2].slice(1, 3)), '["pointer","Zoé"]');
  assert.equal(j.lignes[2][8], 'Oui');
});

test('sécurité : PIN faux refusé, rien n\'est écrit', () => {
  const { ctx, suivi } = monter(jeu);
  const avant = JSON.stringify(suivi.lignes);
  const r = JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify({ pin: '0000', action: 'cloturer', jour: JOUR }) } }).texte);
  assert.equal(r.ok, false);
  assert.equal(JSON.stringify(suivi.lignes), avant);
});

/* ---------- Visiteur sans pré-inscription ---------- */

const VISITEUR = { action: 'visiteur', jour: JOUR, prenom: 'Sam', nom: 'Nouveau', tel: '+33 6 13 13 13 13',
  email: ' Sam.Nouveau@Exemple.FR ', origine: 'Une recherche Google', seize: 'Oui' };

test('visiteur : ligne créée en fin d\'onglet, cellule par cellule', () => {
  const { appel, cellule, suivi } = monter(jeu);
  const r = appel(VISITEUR);
  assert.equal(r.ok, true, r.message);
  assert.equal(r.cree, true);
  const n = 10; // 9 lignes existantes (en-tête, exemple, 7 personnes)
  assert.equal(suivi.lignes.length, n);
  assert.equal(cellule(n, 'DATE_DEMANDE').getTime(), D(2026, 9, 29).getTime());
  assert.equal(cellule(n, 'PRENOM'), 'Sam');
  assert.equal(cellule(n, 'NOM'), 'Nouveau');
  assert.equal(cellule(n, 'TELEPHONE'), '06 13 13 13 13');
  assert.equal(suivi.formats[n + ',5'], '@');
  assert.equal(cellule(n, 'EMAIL'), 'sam.nouveau@exemple.fr');
  assert.equal(cellule(n, 'CRENEAU'), 'mardi 29 septembre');
  assert.equal(cellule(n, 'DATE_ESSAI').getTime(), D(2026, 9, 29).getTime());
  assert.equal(cellule(n, 'DELAI'), '=IF(AND(B10<>"",H10<>""),H10-B10,"")');
  assert.equal(cellule(n, 'VENU'), 'Oui');
  assert.equal(cellule(n, 'ORIGINE'), 'Une recherche Google');
  assert.equal(cellule(n, 'UTM_SOURCE') || '', '');
  assert.equal(cellule(n, 'UTM_CAMPAGNE') || '', '');
  assert.equal(cellule(n, 'N') || '', '');
  assert.equal(cellule(n, 'REMARQUES'), 'Venu sans pré-inscription, saisi via app le 29/09 20h04');
});

test('visiteur : apparaît présent et « sans inscription » dans le cours', () => {
  const { appel } = monter(jeu);
  appel(VISITEUR);
  const c = appel({ action: 'cours', jour: JOUR }).cours.attendus.find((x) => x.prenom === 'Sam');
  assert.equal(c.etat, 'present');
  assert.equal(c.spontane, true);
});

test('visiteur : téléphone déjà connu, rien n\'est créé, on propose la personne', () => {
  const { appel, suivi } = monter(jeu);
  const avant = JSON.stringify(suivi.lignes);
  const r = appel(Object.assign({}, VISITEUR, { tel: '06 11 11 11 11', email: '' }));
  assert.equal(r.ok, true, r.message);
  assert.equal(r.cree, false);
  assert.equal(r.doublons.length, 1);
  assert.equal(r.doublons[0].prenom, 'Zoé');
  assert.equal(r.doublons[0].dateDemande, '10/09');
  assert.equal(JSON.stringify(suivi.lignes), avant);
  // On pointe la personne existante à la place
  const p = appel({ action: 'pointer', cle: r.doublons[0].cle, jour: JOUR });
  assert.equal(p.ok, true, p.message);
});

test('visiteur : email déjà connu détecté aussi', () => {
  const { appel, suivi, COL } = monter(jeu);
  suivi.lignes[3][COL.EMAIL - 1] = 'lea@exemple.fr';
  const r = appel(Object.assign({}, VISITEUR, { tel: '0699999999', email: 'LEA@exemple.fr' }));
  assert.equal(r.cree, false);
  assert.equal(r.doublons[0].prenom, 'Léa');
});

test('visiteur : forcer crée quand même (même téléphone, autre personne)', () => {
  const { appel, cellule } = monter(jeu);
  const r = appel(Object.assign({}, VISITEUR, { tel: '06 11 11 11 11', forcer: true }));
  assert.equal(r.cree, true);
  assert.equal(cellule(10, 'PRENOM'), 'Sam');
});

test('visiteur : données invalides refusées sans rien écrire', () => {
  const { appel, suivi } = monter(jeu);
  const avant = JSON.stringify(suivi.lignes);
  assert.match(appel(Object.assign({}, VISITEUR, { tel: '06 21 13 74 2' })).message, /10 chiffres/);
  assert.match(appel(Object.assign({}, VISITEUR, { prenom: ' ' })).message, /prénom/);
  assert.match(appel(Object.assign({}, VISITEUR, { origine: 'Une recherche google' })).message, /liste/);
  assert.match(appel(Object.assign({}, VISITEUR, { email: 'pas-un-email' })).message, /email/);
  assert.match(appel(Object.assign({}, VISITEUR, { seize: '' })).message, /16 ans/);
  assert.equal(JSON.stringify(suivi.lignes), avant);
});

test('visiteur : moins de 16 ans noté dans les remarques', () => {
  const { appel, cellule } = monter(jeu);
  appel(Object.assign({}, VISITEUR, { seize: 'Non' }));
  assert.match(cellule(10, 'REMARQUES'), /autorisation parentale papier à faire signer/);
});

test('visiteur : annuler la création vide entièrement la ligne', () => {
  const { appel, suivi } = monter(jeu);
  const r = appel(VISITEUR);
  const a = appel({ action: 'annuler', changements: r.changements });
  assert.equal(a.ok, true, a.message);
  assert.ok(suivi.lignes[9].every((v) => v === '' || v === undefined));
});

test('visiteur : ligne libre trouvée même si le retri laisse une ligne vide au milieu', () => {
  const { appel, suivi, cellule } = monter(jeu);
  suivi.lignes.push(new Array(28).fill('')); // ligne 10 vide
  suivi.lignes.push(Object.assign(new Array(28).fill(''), { 2: 'Tardif', 1: new Date(2026, 8, 20) })); // ligne 11
  appel(VISITEUR);
  assert.equal(cellule(12, 'PRENOM'), 'Sam');
  assert.equal(cellule(11, 'PRENOM'), 'Tardif');
});
