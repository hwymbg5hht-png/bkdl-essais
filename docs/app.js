/* BKDL Essais, fonctionnement de la page (étape 2 : pointage et clôture) */
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
    zone.innerHTML = liste.map((c) => carteAttendu(c, attendus.indexOf(c))).join('');
  }
  $('bouton-cloturer').hidden = !attendus.length;

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

function carteAttendu(c, i) {
  const libelle = c.etat === 'present' ? 'Présent' : c.etat === 'absent' ? 'Absent' : 'Pointer';
  return '<article class="carte ' + c.etat + (c.enCours ? ' en-cours' : '') + '" data-i="' + i + '">' + infos(c) +
    '<button class="pointer" type="button" aria-pressed="' + (c.etat === 'present') + '"' +
    (c.enCours ? ' disabled' : '') +
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
/**
 * Message temporaire en bas de l'écran.
 * annuler : fonction appelée si on touche « Annuler » (bouton visible 10 secondes)
 */
function toast(texte, annuler) {
  const t = $('toast');
  t.innerHTML = '<span>' + echapper(texte) + '</span>' +
    (annuler ? '<button type="button" class="toast-annuler">' +
      '<img src="icones/23-annuler-blanc.svg" alt="" width="20" height="20">Annuler</button>' : '');
  t.hidden = false;
  if (annuler) {
    t.querySelector('button').addEventListener('click', () => {
      t.hidden = true;
      clearTimeout(minuterieToast);
      annuler();
    }, { once: true });
  }
  clearTimeout(minuterieToast);
  minuterieToast = setTimeout(() => { t.hidden = true; }, annuler ? 10000 : 3000);
}

/** Petit retour haptique (iPhone récent : astuce de l'interrupteur, sinon vibration Android). */
function vibrer() {
  try {
    if (navigator.vibrate) { navigator.vibrate(15); return; }
    let l = document.getElementById('haptique');
    if (!l) {
      l = document.createElement('label');
      l.id = 'haptique';
      l.hidden = true;
      l.innerHTML = '<input type="checkbox" switch>';
      document.body.appendChild(l);
    }
    l.click();
  } catch (e) { /* pas de retour haptique, tant pis */ }
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
  const bouton = ev.target.closest('.pointer');
  if (!bouton || bouton.disabled) return;
  const c = etat.donnees.cours.attendus[Number(bouton.closest('.carte').dataset.i)];
  if (c.etat === 'present') retirer(c); else pointer(c);
});
$('bouton-cloturer').addEventListener('click', cloturer);
$('bouton-fermer-resume').addEventListener('click', () => $('feuille-resume').close());
$('bouton-visiteur').addEventListener('click', () => toast('L\'ajout d\'un visiteur arrive à l\'étape 3.'));

/* ---------- Écritures dans le classeur ---------- */

/**
 * Lance une écriture pour une personne : la carte change tout de suite,
 * et revient en arrière si le script refuse.
 */
async function ecrirePour(c, action, nouvelEtat, message) {
  const ancienEtat = c.etat;
  const jour = etat.jour;
  c.etat = nouvelEtat;
  c.enCours = true;
  afficher();
  try {
    const r = await appeler(action, { cle: c.cle, jour });
    c.enCours = false;
    afficher();
    if (r.changements.length) {
      toast(message, () => annulerEcriture(r.changements, () => { c.etat = ancienEtat; }));
    } else {
      toast(r.message);
    }
  } catch (e) {
    c.etat = ancienEtat;
    c.enCours = false;
    afficher();
    montrerBandeau(e.message, true);
  }
}

function pointer(c) {
  vibrer();
  ecrirePour(c, 'pointer', 'present', c.prenom + ' pointé présent.');
}

function retirer(c) {
  if (!confirm('Retirer la présence de ' + c.prenom + ' ?')) return;
  ecrirePour(c, 'retirer', 'attendu', 'Présence de ' + c.prenom + ' retirée.');
}

/** Remet les valeurs d'avant dans le classeur (bouton Annuler). */
async function annulerEcriture(changements, retablir) {
  try {
    await appeler('annuler', { changements });
    retablir();
    afficher();
    toast('Annulé.');
  } catch (e) {
    montrerBandeau(e.message, true);
  }
}

/* ---------- Clôture du cours ---------- */

async function cloturer() {
  const attendus = etat.donnees.cours.attendus;
  const aPasser = attendus.filter((c) => c.etat === 'attendu' && !c.badges.dejaVenu);
  const texte = aPasser.length
    ? 'Clôturer le cours ? ' + aPasser.map((c) => c.prenom).join(', ') +
      (aPasser.length > 1 ? ' passeront' : ' passera') + ' à Absent dans le classeur.'
    : 'Clôturer le cours ? Tout le monde est déjà pointé.';
  if (!confirm(texte)) return;
  const jour = etat.jour;
  $('bouton-cloturer').disabled = true;
  try {
    const r = await appeler('cloturer', { jour });
    if (jour === etat.jour) { etat.donnees.cours = r.cours; afficher(); }
    montrerResume(r, jour);
  } catch (e) {
    montrerBandeau(e.message, true);
  } finally {
    $('bouton-cloturer').disabled = false;
  }
}

function montrerResume(r, jour) {
  const a = r.cours.attendus;
  const presents = a.filter((c) => c.etat === 'present');
  const absents = a.filter((c) => c.etat === 'absent');
  const spontanes = a.filter((c) => c.spontane);
  const date = dateEnToutesLettres(jour).toLowerCase();
  $('resume-chiffres').innerHTML =
    '<b>' + presents.length + '</b>' + (presents.length > 1 ? 'présents' : 'présent') +
    '<span class="sep">·</span><b>' + absents.length + '</b>' + (absents.length > 1 ? 'absents' : 'absent') +
    '<span class="sep">·</span><b>' + spontanes.length + '</b>sans inscription';
  $('resume-absents').innerHTML = absents.length
    ? absents.map((c) => {
      const corps = 'Bonjour ' + c.prenom + ', on ne t\'a pas vu au cours d\'essai du ' + date +
        '. Pas de souci ! Tu veux qu\'on te propose une autre date ? Dom, Bujinkan Kitamori Dôjô Lille';
      return '<li><span>' + echapper(c.prenom + (c.nom ? ' ' + c.nom : '')) + '</span>' +
        (c.cle.tel ? '<a class="bouton-sms" href="sms:' + c.cle.tel + '&body=' + encodeURIComponent(corps) + '">' +
          '<img src="icones/16-message-sumi.svg" alt="" width="24" height="24">Proposer une date</a>' : '') +
        '</li>';
    }).join('')
    : '<li class="vide-resume">Aucun absent.</li>';
  const boutonAnnuler = $('bouton-annuler-cloture');
  boutonAnnuler.hidden = !r.changements.length;
  boutonAnnuler.onclick = async () => {
    boutonAnnuler.hidden = true;
    $('feuille-resume').close();
    try {
      await appeler('annuler', { changements: r.changements });
      toast('Clôture annulée.');
    } catch (e) {
      montrerBandeau(e.message, true);
    }
    charger(etat.jour);
  };
  setTimeout(() => { boutonAnnuler.hidden = true; }, 10000);
  $('feuille-resume').showModal();
}

/* ---------- Démarrage ---------- */

charger();
