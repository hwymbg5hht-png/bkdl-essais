/**
 * Tests automatiques de apps-script/Logique.gs
 * Lancer depuis le dossier du projet : npm test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const L = require(path.join(__dirname, '..', 'apps-script', 'Logique.gs'));

const AUJ = new Date(2026, 8, 24); // jeudi 24 septembre 2026
const D = (a, m, j) => new Date(a, m - 1, j);
const cle = (a, m, j) => L.cleJour(D(a, m, j));

/** Fabrique une ligne brute A à AB à partir de quelques champs. */
function ligne(numero, champs) {
  const v = new Array(L.NB_COLONNES).fill('');
  for (const [nom, val] of Object.entries(champs)) v[L.COL[nom] - 1] = val;
  return L.lireLigne(v, numero);
}

/* ---------- Dates ---------- */

test('dates : « mardi 22 septembre » sans année', () => {
  const r = L.lireDateEssai('mardi 22 septembre', D(2026, 9, 10), AUJ);
  assert.equal(L.cleJour(r.date), '2026-09-22');
  assert.equal(r.aVerifier, false);
});

test('dates : « 22 septembre 2026 »', () => {
  const r = L.lireDateEssai('22 septembre 2026', D(2026, 9, 10), AUJ);
  assert.equal(L.cleJour(r.date), '2026-09-22');
});

test('dates : « 29/9/2026 » et « 6/10/2026 »', () => {
  assert.equal(L.cleJour(L.lireDateEssai('29/9/2026', '', AUJ).date), '2026-09-29');
  assert.equal(L.cleJour(L.lireDateEssai('6/10/2026', '', AUJ).date), '2026-10-06');
});

test('dates : vraie date du classeur', () => {
  assert.equal(L.cleJour(L.lireDateEssai(new Date(2026, 9, 6, 20, 0), '', AUJ).date), '2026-10-06');
});

test('dates : texte libre et vide ne sont jamais datables', () => {
  for (const t of ['Un autre mardi (ou un autre jour), on en parle par SMS.',
    'STAGE de préférence', '????', '', null, undefined, '   ']) {
    assert.equal(L.lireDateEssai(t, D(2026, 9, 10), AUJ), null, String(t));
  }
});

test('dates : demande de décembre pour un essai en janvier', () => {
  const r = L.lireDateEssai('mardi 5 janvier', D(2026, 12, 18), D(2027, 1, 2));
  assert.equal(L.cleJour(r.date), '2027-01-05');
  assert.equal(r.aVerifier, false);
});

test('dates : cours passé revu plus tard reste dans la bonne année', () => {
  // Demande du 10/09, on regarde le 24/09 le cours du 22/09 : pas 2027
  const r = L.lireDateEssai('mardi 22 septembre', D(2026, 9, 10), AUJ);
  assert.equal(r.date.getFullYear(), 2026);
});

test('dates : jour de semaine faux signalé « à vérifier »', () => {
  const r = L.lireDateEssai('mardi 23 septembre', D(2026, 9, 10), AUJ);
  assert.equal(L.cleJour(r.date), '2026-09-23');
  assert.equal(r.aVerifier, true);
});

test('dates : date impossible refusée', () => {
  assert.equal(L.lireDateEssai('31/2/2026', '', AUJ), null);
});

test('dates : « 1er octobre » et mots en trop signalés', () => {
  assert.equal(L.cleJour(L.lireDateEssai('jeudi 1er octobre', D(2026, 9, 20), AUJ).date), '2026-10-01');
  const r = L.lireDateEssai('6/10 si possible', D(2026, 9, 20), AUJ);
  assert.equal(L.cleJour(r.date), '2026-10-06');
  assert.equal(r.aVerifier, true);
});

test('créneau : format de la colonne G', () => {
  assert.equal(L.formaterCreneau(D(2026, 9, 29)), 'mardi 29 septembre');
  assert.equal(L.formaterCreneau(D(2026, 8, 15)), 'samedi 15 août');
});

/* ---------- Téléphones ---------- */

test('téléphones : formats valides ramenés à 10 chiffres', () => {
  assert.equal(L.normaliserTelephone('06 44 08 89 08'), '0644088908');
  assert.equal(L.normaliserTelephone('+33 6 44 08 89 08'), '0644088908');
  assert.equal(L.normaliserTelephone('33644088908'), '0644088908');
  assert.equal(L.normaliserTelephone('+330615585548'), '0615585548');
  assert.equal(L.normaliserTelephone(644088908), '0644088908'); // 0 perdu par le classeur
});

test('téléphones : 9 chiffres commençant par 0 invalide', () => {
  assert.equal(L.normaliserTelephone('06 21 13 74 2'), '');
  assert.equal(L.normaliserTelephone(''), '');
});

test('téléphones : affichage « 06 12 34 56 78 »', () => {
  assert.equal(L.formaterTelephone('+33612345678'), '06 12 34 56 78');
});

/* ---------- Attendus ---------- */

const JOUR = cle(2026, 9, 29);

function jeuDeTest() {
  return [
    ligne(2, { PRENOM: 'Candice', TELEPHONE: '06 00 00 00 00', CRENEAU: 'mardi 29 septembre', DATE_DEMANDE: D(2026, 9, 1) }),
    ligne(3, { PRENOM: 'Zoé', TELEPHONE: '06 11 11 11 11', CRENEAU: 'mardi 29 septembre', DATE_DEMANDE: D(2026, 9, 10) }),
    ligne(4, { PRENOM: 'Adam', TELEPHONE: '06 22 22 22 22', CRENEAU: 'mardi 22 septembre',
      REPORTE: 'Oui', NOUVELLE_DATE: '29/9/2026', DATE_DEMANDE: D(2026, 9, 5) }),
    ligne(5, { PRENOM: 'Bruno', TELEPHONE: '06 33 33 33 33', CRENEAU: 'mardi 29 septembre',
      REPORTE: 'Oui', NOUVELLE_DATE: '6/10/2026', DATE_DEMANDE: D(2026, 9, 5) }),
    ligne(6, { PRENOM: 'Chloé', TELEPHONE: '06 44 44 44 44', CRENEAU: 'mardi 29 septembre',
      REPORTE: 'Oui', DATE_DEMANDE: D(2026, 9, 5) }),
    ligne(7, { PRENOM: 'Denis', TELEPHONE: '06 55 55 55 55', CRENEAU: '29/9/2026',
      REMARQUES: 'A annulé par SMS', DATE_DEMANDE: D(2026, 9, 5) }),
    ligne(8, { PRENOM: 'Léa', TELEPHONE: '+33 6 66 66 66 66', CRENEAU: 'mardi 29 septembre', DATE_DEMANDE: D(2026, 9, 12) }),
    ligne(9, { PRENOM: 'Hugo', TELEPHONE: '06 66 66 66 66', CRENEAU: '29 septembre 2026', DATE_DEMANDE: D(2026, 9, 12) }),
    ligne(10, { PRENOM: 'Eve', TELEPHONE: '06 77 77 77 77', CRENEAU: 'STAGE de préférence', DATE_DEMANDE: D(2026, 9, 12) }),
    ligne(11, { PRENOM: 'Farid', TELEPHONE: '06 88 88 88 88', CRENEAU: 'mardi 29 septembre',
      SMS_RAPPEL: true, REPONSE_RAPPEL: 'OUI', DATE_DEMANDE: D(2026, 9, 12) }),
    ligne(12, {})
  ];
}

test('attendus : N prioritaire sur G, annulés et reportés à part', () => {
  const c = L.coursDuJour(jeuDeTest(), JOUR, AUJ);
  assert.deepEqual(c.attendus.map(x => x.prenom), ['Adam', 'Farid', 'Hugo', 'Léa', 'Zoé']);
  assert.deepEqual(c.annules.map(x => x.prenom), ['Chloé', 'Denis']);
  assert.deepEqual(c.reportes.map(x => x.prenom), ['Bruno']);
  assert.equal(c.reportes[0].nouvelleDate, '2026-10-06');
});

test('attendus : l\'exemple fictif de la ligne 2 est ignoré', () => {
  const c = L.coursDuJour(jeuDeTest(), JOUR, AUJ);
  assert.ok(!c.attendus.some(x => x.prenom === 'Candice'));
});

test('attendus : badges', () => {
  const c = L.coursDuJour(jeuDeTest(), JOUR, AUJ);
  const adam = c.attendus.find(x => x.prenom === 'Adam');
  const farid = c.attendus.find(x => x.prenom === 'Farid');
  assert.equal(adam.badges.reporteIci, true);
  assert.equal(farid.badges.rappelEnvoye, true);
  assert.equal(farid.badges.reponseOui, true);
  assert.equal(adam.badges.rappelEnvoye, false);
});

test('attendus : même téléphone, deux prénoms, deux cartes', () => {
  const c = L.coursDuJour(jeuDeTest(), JOUR, AUJ);
  const lea = c.attendus.find(x => x.prenom === 'Léa');
  const hugo = c.attendus.find(x => x.prenom === 'Hugo');
  assert.equal(lea.cle.tel, '0666666666');
  assert.equal(hugo.cle.tel, '0666666666');
});

test('dates de cours : uniquement celles qui ont des attendus', () => {
  const dates = L.datesDeCours(jeuDeTest(), AUJ);
  assert.ok(dates.includes('2026-09-29'));
  assert.ok(dates.includes('2026-10-06'));
  assert.ok(!dates.includes('2026-09-22')); // Adam reporté, plus personne ce jour-là
});

test('état présent seulement si H = jour du cours', () => {
  const l = [ligne(3, { PRENOM: 'Ines', TELEPHONE: '0612121212', CRENEAU: '29/9/2026',
    DATE_ESSAI: D(2026, 9, 29), VENU: 'Oui' })];
  assert.equal(L.coursDuJour(l, JOUR, AUJ).attendus[0].etat, 'present');
});

test('visiteur sans pré-inscription repéré par la trace en AB', () => {
  const l = [ligne(3, { PRENOM: 'Sam', TELEPHONE: '0613131313', CRENEAU: 'mardi 29 septembre',
    DATE_DEMANDE: D(2026, 9, 29), DATE_ESSAI: D(2026, 9, 29), VENU: 'Oui',
    REMARQUES: 'Venu sans pré-inscription, saisi via app le 29/09 20:04' })];
  const c = L.coursDuJour(l, JOUR, AUJ).attendus[0];
  assert.equal(c.spontane, true);
  assert.equal(c.etat, 'present');
});

/* ---------- Retrouver la ligne ---------- */

test('trouverLigne : même téléphone, le prénom départage', () => {
  const lignes = jeuDeTest();
  const r1 = L.trouverLigne(lignes, { tel: '0666666666', prenom: 'Lea' }, AUJ);
  const r2 = L.trouverLigne(lignes, { tel: '06 66 66 66 66', prenom: 'HUGO' }, AUJ);
  assert.equal(r1.ok, true); assert.equal(r1.ligne.numeroLigne, 8);
  assert.equal(r2.ok, true); assert.equal(r2.ligne.numeroLigne, 9);
});

test('trouverLigne : retri simulé, on retombe sur la bonne ligne', () => {
  // On lit le cours, puis le classeur est retrié (lignes déplacées et renumérotées)
  const avant = jeuDeTest();
  const zoe = L.coursDuJour(avant, JOUR, AUJ).attendus.find(x => x.prenom === 'Zoé');
  const brut = avant.slice(1).reverse(); // ordre inversé après retri
  const apres = [avant[0]].concat(brut.map((l, i) => Object.assign({}, l, { numeroLigne: i + 3 })));
  const r = L.trouverLigne(apres, Object.assign({ jour: JOUR }, zoe.cle), AUJ);
  assert.equal(r.ok, true);
  assert.equal(r.ligne.prenom, 'Zoé');
  assert.equal(r.ligne.numeroLigne, apres.findIndex(l => l.prenom === 'Zoé') + 2);
});

test('trouverLigne : à défaut de téléphone, l\'email', () => {
  const l = [ligne(3, { PRENOM: 'Max', EMAIL: 'Max@Exemple.fr' })];
  const r = L.trouverLigne(l, { tel: '', email: 'max@exemple.fr', prenom: 'Max' }, AUJ);
  assert.equal(r.ok, true);
});

test('trouverLigne : refus si prénom différent', () => {
  const r = L.trouverLigne(jeuDeTest(), { tel: '0611111111', prenom: 'Paul' }, AUJ);
  assert.equal(r.ok, false); assert.equal(r.code, 'prenom');
});

test('trouverLigne : refus si introuvable', () => {
  const r = L.trouverLigne(jeuDeTest(), { tel: '0699999999', prenom: 'Zoé' }, AUJ);
  assert.equal(r.ok, false); assert.equal(r.code, 'introuvable');
});

test('trouverLigne : doublon réel départagé par le jour, sinon refus', () => {
  const l = [
    ligne(3, { PRENOM: 'Tom', TELEPHONE: '0610101010', CRENEAU: '22/9/2026' }),
    ligne(4, { PRENOM: 'Tom', TELEPHONE: '0610101010', CRENEAU: '29/9/2026' })
  ];
  const ok = L.trouverLigne(l, { tel: '0610101010', prenom: 'Tom', jour: JOUR }, AUJ);
  assert.equal(ok.ok, true); assert.equal(ok.ligne.numeroLigne, 4);
  const ko = L.trouverLigne(l, { tel: '0610101010', prenom: 'Tom' }, AUJ);
  assert.equal(ko.ok, false); assert.equal(ko.code, 'plusieurs');
});

test('trouverLigne : l\'exemple fictif n\'est jamais retrouvé', () => {
  const r = L.trouverLigne(jeuDeTest(), { tel: '0600000000', prenom: 'Candice' }, AUJ);
  assert.equal(r.ok, false);
});

test('chercherDoublons : par téléphone ou email', () => {
  const d = L.chercherDoublons(jeuDeTest(), '+33 6 11 11 11 11', '');
  assert.deepEqual(d.map(x => x.prenom), ['Zoé']);
});

test('venu un autre jour que prévu : affiché le jour où il est venu', () => {
  const l = [ligne(3, { PRENOM: 'Yann', TELEPHONE: '0614141414', CRENEAU: 'mardi 6 octobre',
    DATE_DEMANDE: D(2026, 9, 20), DATE_ESSAI: D(2026, 9, 29), VENU: 'Oui' })];
  const c = L.coursDuJour(l, JOUR, AUJ);
  assert.equal(c.attendus.length, 1);
  assert.equal(c.attendus[0].etat, 'present');
  assert.ok(L.datesDeCours(l, AUJ).includes(JOUR));
});
