# Guide d'installation, BKDL Essais

Ce guide se lit dans l'ordre. Chaque partie dit combien de temps elle prend.
Tu ne fais chaque partie qu'une fois, sauf « Redéployer après une modification ».

Vocabulaire :
- **le script** : le petit programme Google qui lit et écrit dans le classeur à ta place
- **la page** : l'app elle-même, publiée sur GitHub Pages, que tu ouvres sur l'iPhone
- **le PIN** : un code que toi seul connais, demandé une fois sur l'iPhone

---

## 1. Créer la copie de test (5 min, déjà fait)

1. Ouvre le classeur « suivi BKDL essai 2026 2027 ».
2. Fichier, Créer une copie. Nom : `TEST app pointage`. Laisse les cases de partage décochées. Créer une copie.
3. Dans la copie, regarde la barre d'adresse : `https://docs.google.com/spreadsheets/d/`**`XXXXXXXX`**`/edit`.
   La partie en gras est **l'identifiant de la copie**. Tu en auras besoin en 2.6.

Les automatisations Claude (saisie quotidienne, SMS de la veille) ne touchent pas cette copie : tu peux y faire toutes les bêtises que tu veux.

## 2. Installer le script Google (20 min)

### 2.1 Créer le projet

1. Va sur **script.google.com** avec ton compte Google du club.
2. Clique sur **Nouveau projet** (en haut à gauche).
3. Clique sur « Projet sans titre » en haut et renomme-le `BKDL Essais`.

### 2.2 Coller le fichier Code

1. Sur ton Mac, ouvre le Terminal et colle cette ligne (elle copie le fichier dans le presse-papiers) :
   ```
   pbcopy < ~/Desktop/"App Essai BKDL"/apps-script/Code.gs
   ```
2. Dans l'éditeur Apps Script, clique dans le fichier `Code.gs`, sélectionne tout (Cmd A), colle (Cmd V).

### 2.3 Ajouter le fichier Logique

1. Dans le Terminal :
   ```
   pbcopy < ~/Desktop/"App Essai BKDL"/apps-script/Logique.gs
   ```
2. Dans l'éditeur, clique sur le **+** à côté de « Fichiers », puis **Script**. Nomme-le `Logique` (sans rien après, Google ajoute `.gs` tout seul).
3. Sélectionne tout ce qu'il contient, colle.
4. Clique sur l'icône disquette (Enregistrer le projet).

### 2.4 Régler le fuseau horaire

1. Dans la colonne de gauche, clique sur la roue dentée **Paramètres du projet**.
2. Fuseau horaire : choisis **(GMT+01:00) Paris**.

### 2.5 Choisir ton PIN

Choisis 6 chiffres que tu retiens facilement mais qui ne sont ni ta date de naissance ni 123456.

### 2.6 Ranger le PIN et l'identifiant du classeur

Toujours dans **Paramètres du projet**, descends jusqu'à **Propriétés du script**, clique sur **Ajouter une propriété du script** deux fois :

| Propriété | Valeur |
|---|---|
| `PIN` | ton PIN |
| `ID_CLASSEUR` | l'identifiant de la copie TEST (voir 1.3) |

Clique sur **Enregistrer les propriétés du script**.

Ces deux valeurs ne sont écrites nulle part ailleurs, ni dans le code, ni sur GitHub.

### 2.7 Premier essai et autorisation

1. Reviens dans l'éditeur (icône `< >` à gauche), ouvre `Code.gs`.
2. En haut, dans la liste déroulante à droite de « Déboguer », choisis **essaiLecture**.
3. Clique sur **Exécuter**.
4. Google demande une autorisation : **Examiner les autorisations**, choisis ton compte.
5. Un écran dit « Google n'a pas validé cette application ». C'est normal : c'est ton propre script. Clique sur **Paramètres avancés**, puis **Accéder à BKDL Essais (non sécurisé)**, puis **Autoriser**.
6. En bas, le **Journal d'exécution** affiche par exemple :
   `Classeur lu à 19h52, cours du 2026-09-24 : 0 attendus, 0 annulés, 0 reportés ailleurs.`
   puis les prochaines dates de cours et d'où viennent les listes déroulantes.

Si tu vois une ligne « ATTENTION », refais l'étape 2.4.

### 2.8 Publier le script

1. En haut à droite, **Déployer**, puis **Nouveau déploiement**.
2. Clique sur la roue à côté de « Sélectionner le type », choisis **Application Web**.
3. Description : `étape 1`.
4. Exécuter en tant que : **Moi**.
5. Qui peut accéder : **Tout le monde**. (Ça veut dire que l'adresse répond à tout le monde, mais sans ton PIN elle ne donne rien. Et après 5 PIN faux, elle se bloque 15 minutes.)
6. **Déployer**. Copie l'**URL de l'application Web**. Elle finit par `/exec`.
7. Vérification : colle cette adresse dans Safari sur le Mac. Tu dois lire
   `BKDL Essais : le script répond (version 1). Aucune donnée ici.`

Garde cette adresse dans une note Apple : tu vas la coller sur l'iPhone.

## 3. Publier la page sur GitHub Pages (20 min, une seule fois)

On utilise **GitHub Desktop**, une app gratuite qui évite toute ligne de commande.

1. Télécharge GitHub Desktop sur **desktop.github.com**, installe-le, ouvre-le et connecte-toi avec ton compte GitHub.
2. Menu **File**, **Add Local Repository…**, choisis le dossier `App Essai BKDL` sur ton Bureau, **Add Repository**.
3. Clique sur **Publish repository** en haut.
   - Name : `bkdl-essais`
   - **Décoche** « Keep this code private » (GitHub Pages gratuit exige un dépôt public. Il n'y a aucune donnée dedans, ni PIN, ni adresse du script, ni identifiant du classeur.)
   - **Publish Repository**.
4. Sur **github.com**, ouvre ton dépôt `bkdl-essais`, onglet **Settings**, menu de gauche **Pages**.
5. Source : **Deploy from a branch**. Branch : **main**, dossier **/docs**. **Save**.
6. Attends 1 à 2 minutes et recharge la page : GitHub affiche l'adresse de ton app, du type
   `https://ton-pseudo.github.io/bkdl-essais/`

## 4. Ouvrir l'app sur l'iPhone (5 min)

1. Envoie-toi les deux adresses (la page GitHub et le script `/exec`) dans une note Apple partagée entre Mac et iPhone.
2. Sur l'iPhone, ouvre l'adresse de la page **dans Safari**.
3. L'écran Réglages s'ouvre : colle l'adresse du script, tape ton PIN.
4. **Tester la connexion** : tu dois lire « Connexion réussie : « TEST app pointage », N lignes ».
5. **Enregistrer**. La liste du jour s'affiche. Les flèches passent au cours précédent ou suivant.

L'ajout sur l'écran d'accueil viendra à l'étape 5, quand l'app saura fonctionner sans réseau.

---

## Redéployer après une modification du script

Quand je modifie `Code.gs` ou `Logique.gs` :

1. Recolle le ou les fichiers modifiés (2.2 et 2.3), enregistre.
2. **Déployer**, **Gérer les déploiements**.
3. Clique sur le crayon (Modifier) du déploiement existant.
4. Version : **Nouvelle version**. Description : le nom de l'étape. **Déployer**.

L'adresse `/exec` ne change pas, rien à refaire sur l'iPhone.
Ne clique **pas** sur « Nouveau déploiement » : ça créerait une nouvelle adresse.

## Publier une nouvelle version de la page

C'est moi qui enregistre les versions sur le Mac (le « commit »). Toi, tu publies :

1. Ouvre GitHub Desktop.
2. En haut, clique sur **Push origin** (le bouton indique le nombre de versions à envoyer).
3. Attends 1 à 2 minutes, puis recharge la page sur l'iPhone.

Si GitHub Desktop affiche des fichiers modifiés dans la colonne de gauche, ne les enregistre pas toi-même : dis-le-moi.
