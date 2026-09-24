/* BKDL Essais, fonctionnement de la page (étape 1 : lecture seule) */
'use strict';

const CLE_REGLAGES = 'bkdl.reglages';

const etat = {
  reglages: lireReglages(),
  donnees: null,   // dernière réponse du script
  jour: null,      // « 2026-09-29 »
  recherche: ''
};

const $ = (id) => document.getElementById(id);

/* ---------- Réglages (PIN et adresse du script, gardés sur cet appareil) ---------- */

function lireReglages() {
  try { return JSON.parse(localStorage.getItem(CLE_REGLAGES)) || {}; } catch (e) { return {}; }
}

function ecrireReglages(r) {
  etat.reglages = r;
  try { localStorage.setItem(CLE_REGLAGES, JSON.stringify(r)); } catch (e) { /* stockage bloqué */ }
}

function reglagesComplets() {
  return !!(etat.reglages.url && etat.reglages.pin);
}

/* ---------- Appel du script Google ---------- */

async function appeler(action, parametres, reglages) {
  const r = reglages || etat.reglages;
  let reponse;
  try {
    reponse = await fetch(r.url, {
      method: 'POST',
      // text/plain évite la vérification préalable que Google refuse
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ pin: r.pin, action }, parametres || {})),
      redirect: 'follow'
    });
  } catch (e) {
    throw new Error('Pas de réseau, ou adresse du script injoignable.');
  }
  let json;
  try { json = await reponse.json(); } catch (e) {
    throw new Error('Réponse illisible du script. Vérifie l\'adresse (elle finit par /exec) et que le déploiement est accessible à « Tout le monde ».');
  }
  if (!json.ok) throw new Error(json.message || 'Erreur inconnue du script.');
  return json;
}

/* ---------- Dates ---------- */

function dateDepuisCle(cle) {
  const [a, m, j] = cle.split('-').map(Number);
  return new Date(a, m - 1, j);
}

function cleDepuisDate(d) {
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

function dateEnToutesLettres(cle, avecAnnee) {
  const d = dateDepuisCle(cle);
  const options = { weekday: 'long', day: 'numeric', month: 'long' };
  if (avecAnnee) options.year = 'numeric';
  const t = d.toLocaleDateString('fr-FR', options).replace(/^(\S+) 1 /, (m, jour) => jour + ' 1er ');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/* ---------- Chargement ---------- */

let numeroChargement = 0;

async function charger(jour) {
  if (!reglagesComplets()) { ouvrirReglages(); return; }
  const numero = ++numeroChargement;
  $('etat-lecture').textContent = 'Lecture du classeur…';
  masquerBandeau();
  try {
    const d = await appeler('cours', jour ? { jour } : {});
    if (numero !== numeroChargement) return; // un chargement plus récent a pris le relais
    etat.donnees = d;
    etat.jour = d.jour;
    afficher();
    if (d.avertissement) montrerBandeau(d.avertissement);
  } catch (e) {
    if (numero !== numeroChargement) return;
    $('etat-lecture').textContent = '';
    montrerBandeau(e.message, true);
  }
}

/* ---------- Affichage ---------- */

function echapper(t) {
  return String(t == null ? '' : t).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function afficher() {
  const d = etat.donnees;
  if (!d) return;
  const jour = etat.jour;
  const anneeCourante = jour.slice(0, 4) === d.aujourdhui.slice(0, 4);

  $('date-cours').textContent = dateEnToutesLettres(jour, !anneeCourante);
  $('sous-titre').textContent = jour === d.aujourdhui ? 'Cours d\'essai · aujourd\'hui' : 'Cours d\'essai';
  $('choix-date').value = jour;

  $('cours-precedent').disabled = !coursVoisin(-1);
  $('cours-suivant').disabled = !coursVoisin(1);

  // Compteur
  const attendus = d.cours.attendus;
  const inscrits = attendus.filter((c) => !c.spontane).length;
  const presents = attendus.filter((c) => c.etat === 'present').length;
  const spontanes = attendus.filter((c) => c.spontane).length;
  $('compteur').innerHTML =
    '<b>' + inscrits + '</b>' + (inscrits > 1 ? 'attendus' : 'attendu') +
    '<span class="sep">·</span><b>' + presents + '</b>' + (presents > 1 ? 'présents' : 'présent') +
    '<span class="sep">·</span><b>' + spontanes + '</b>sans inscription';

  $('etat-lecture').innerHTML = 'Classeur lu à ' + echapper(d.lu) +
    ' <button type="button" id="bouton-actualiser">Actualiser</button>';
  $('bouton-actualiser').addEventListener('click', () => charger(etat.jour));

  // Listes
  const filtre = filtreRecherche(etat.recherche);
  const liste = attendus.filter(filtre);
  const zone = $('liste-attendus');
  if (!attendus.length) {
    const suivant = coursVoisin(1);
    zone.innerHTML = '<div class="vide"><p>Personne n\'est attendu ce jour-là.</p>' +
      (suivant ? '<button class="bouton-secondaire" type="button" id="aller-suivant">Aller au ' +
        echapper(dateEnToutesLettres(suivant).toLowerCase()) + '</button>' : '') + '</div>';
    if (suivant) $('aller-suivant').addEventListener('click', () => charger(suivant));
  } else if (!liste.length) {
    zone.innerHTML = '<div class="vide"><p>Personne ne correspond à « ' + echapper(etat.recherche) + ' ».</p></div>';
  } else {
    zone.innerHTML = liste.map(carteAttendu).join('');
  }

  remplirGroupe('reportes', d.cours.reportes.filter(filtre), 'Reportés à une autre date');
  remplirGroupe('annules', d.cours.annules.filter(filtre), 'Annulés');
}

/** Date de cours avant (-1) ou après (1) le jour affiché. */
function coursVoisin(sens) {
  const dates = (etat.donnees && etat.donnees.dates) || [];
  if (sens < 0) return dates.filter((x) => x < etat.jour).pop() || null;
  return dates.find((x) => x > etat.jour) || null;
}

function filtreRecherche(texte) {
  const t = simplifier(texte);
  if (!t) return () => true;
  const chiffres = t.replace(/\D/g, '');
  return (c) => {
    if (chiffres.length >= 2 && chiffres === t.replace(/\s/g, '')) {
      return c.cle.tel.endsWith(chiffres);
    }
    return simplifier(c.prenom + ' ' + c.nom).includes(t);
  };
}

function simplifier(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function badges(c) {
  const b = [];
  if (c.badges.rappelEnvoye) b.push('<span class="badge">Rappel envoyé</span>');
  if (c.badges.reponseOui) b.push('<span class="badge">Réponse OUI</span>');
  if (c.badges.reporteIci) b.push('<span class="badge">Reporté ici</span>');
  if (c.badges.dejaVenu) b.push('<span class="badge">Déjà venu</span>');
  if (c.spontane) b.push('<span class="badge">Sans inscription</span>');
  if (c.dateAVerifier) b.push('<span class="badge doute">Date à vérifier</span>');
  return b.length ? '<div class="badges">' + b.join('') + '</div>' : '';
}

function contacts(c) {
  if (!c.cle.tel) return '';
  const p = echapper(c.prenom);
  return '<div class="contacts">' +
    '<a href="tel:' + c.cle.tel + '" aria-label="Appeler ' + p + '"><img src="icones/02-telephone-sumi.svg" alt="" width="24" height="24"></a>' +
    '<a href="sms:' + c.cle.tel + '" aria-label="Envoyer un SMS à ' + p + '"><img src="icones/16-message-sumi.svg" alt="" width="24" height="24"></a>' +
    '</div>';
}

function infos(c) {
  return '<div class="carte-infos">' +
    '<h2 class="prenom">' + echapper(c.prenom || '(sans prénom)') +
    (c.nom ? ' <span class="nom">' + echapper(c.nom) + '</span>' : '') + '</h2>' +
    badges(c) +
    '<div class="carte-bas">' + contacts(c) +
    (c.origine ? '<p class="origine">' + echapper(c.origine) + '</p>' : '') + '</div>' +
    '</div>';
}

function carteAttendu(c) {
  const libelle = c.etat === 'present' ? 'Présent' : c.etat === 'absent' ? 'Absent' : 'Pointer';
  return '<article class="carte ' + c.etat + '">' + infos(c) +
    '<button class="pointer" type="button" aria-pressed="' + (c.etat === 'present') + '"' +
    ' aria-label="' + libelle + ' : ' + echapper(c.prenom) + '">' +
    '<img src="icones/13-validation-blanc.svg" alt="" width="28" height="28">' + libelle +
    '</button></article>';
}

function remplirGroupe(nom, cartes, titre) {
  const groupe = $('groupe-' + nom);
  groupe.hidden = !cartes.length;
  groupe.querySelector('summary').textContent = titre + ' (' + cartes.length + ')';
  $('liste-' + nom).innerHTML = cartes.map((c) => '<article class="carte">' + infos(c) + '</article>').join('');
  if (nom === 'reportes') {
    // Ajoute la nouvelle date sous le nom
    $('liste-' + nom).querySelectorAll('.carte-infos').forEach((el, i) => {
      const p = document.createElement('p');
      p.className = 'nouvelle-date';
      p.textContent = 'Reporté au ' + dateEnToutesLettres(cartes[i].nouvelleDate).toLowerCase();
      el.querySelector('.prenom').after(p);
    });
  }
}

/* ---------- Bandeau et message temporaire ---------- */

function montrerBandeau(texte, erreur) {
  const b = $('bandeau');
  b.textContent = texte;
  b.className = 'bandeau' + (erreur ? ' erreur' : '');
  b.hidden = false;
}

function masquerBandeau() { $('bandeau').hidden = true; }

let minuterieToast;
function toast(texte) {
  const t = $('toast');
  t.textContent = texte;
  t.hidden = false;
  clearTimeout(minuterieToast);
  minuterieToast = setTimeout(() => { t.hidden = true; }, 3000);
}

/* ---------- Écran des réglages ---------- */

function ouvrirReglages() {
  $('reglage-url').value = etat.reglages.url || '';
  $('reglage-pin').value = etat.reglages.pin || '';
  $('message-reglages').textContent = reglagesComplets() ? '' :
    'Colle l\'adresse du script et ton PIN pour commencer.';
  $('feuille-reglages').showModal();
}

function reglagesSaisis() {
  return { url: $('reglage-url').value.trim(), pin: $('reglage-pin').value.trim() };
}

function adresseValide(url) {
  return /^https:\/\/script\.google\.com\/.+\/exec$/.test(url);
}

$('form-reglages').addEventListener('submit', (ev) => {
  const r = reglagesSaisis();
  if (!adresseValide(r.url)) {
    ev.preventDefault();
    $('message-reglages').textContent = 'L\'adresse doit commencer par https://script.google.com/ et finir par /exec.';
    return;
  }
  if (!r.pin) { ev.preventDefault(); $('message-reglages').textContent = 'Saisis ton PIN.'; return; }
  ecrireReglages(r);
  charger(etat.jour);
});

$('bouton-tester').addEventListener('click', async () => {
  const r = reglagesSaisis();
  const msg = $('message-reglages');
  if (!adresseValide(r.url)) { msg.textContent = 'L\'adresse doit finir par /exec.'; return; }
  msg.textContent = 'Test en cours…';
  try {
    const t = await appeler('test', {}, r);
    msg.textContent = 'Connexion réussie : « ' + t.classeur + ' », ' + t.lignes + ' lignes.' +
      (t.avertissement ? ' ' + t.avertissement : '');
  } catch (e) {
    msg.textContent = e.message;
  }
});

$('bouton-fermer-reglages').addEventListener('click', () => $('feuille-reglages').close());

$('bouton-vider').addEventListener('click', () => {
  if (!confirm('Effacer de ce téléphone le PIN, l\'adresse du script et toutes les données gardées ?')) return;
  try { localStorage.clear(); } catch (e) { /* rien */ }
  etat.reglages = {};
  etat.donnees = null;
  $('liste-attendus').innerHTML = '';
  $('compteur').textContent = '';
  $('feuille-reglages').close();
  toast('Données de cet appareil effacées.');
  setTimeout(ouvrirReglages, 400);
});

/* ---------- Navigation et actions ---------- */

$('bouton-reglages').addEventListener('click', ouvrirReglages);
$('cours-precedent').addEventListener('click', () => { const j = coursVoisin(-1); if (j) charger(j); });
$('cours-suivant').addEventListener('click', () => { const j = coursVoisin(1); if (j) charger(j); });

$('date-cours').addEventListener('click', () => {
  const champ = $('choix-date');
  if (champ.showPicker) { try { champ.showPicker(); return; } catch (e) { /* iOS ancien */ } }
  champ.focus();
  champ.click();
});
$('choix-date').addEventListener('change', (ev) => { if (ev.target.value) charger(ev.target.value); });

$('recherche').addEventListener('input', (ev) => { etat.recherche = ev.target.value; afficher(); });

$('liste-attendus').addEventListener('click', (ev) => {
  if (ev.target.closest('.pointer')) toast('Le pointage arrive à l\'étape 2.');
});
$('bouton-visiteur').addEventListener('click', () => toast('L\'ajout d\'un visiteur arrive à l\'étape 3.'));

/* ---------- Démarrage ---------- */

charger();
