# FaceAlbum Android — première base native

Cette version est un **prototype Android natif**, distinct de la PWA. Elle propose deux parcours : **Toutes les photos** (permission de lecture de la galerie) et **Choisir des photos** (sélecteur système Android, sélection multiple). Les photos sont parcourues par lots de 20 avec une progression et un bouton Arrêter.

**Important : ce prototype ne reconnaît pas encore les personnes et ne crée pas d'albums automatiques.** Il sert à tester la sélection native et les performances avant d'intégrer un modèle de reconnaissance local. Il ne déplace, ne supprime et ne modifie aucune photo.

## Compiler
Ouvrir le dossier `android-app` dans Android Studio récent (JDK 17, SDK 35). Synchroniser Gradle puis Build > Build APK(s). APK de debug : `app/build/outputs/apk/debug/app-debug.apk`.

Il n'y a pas encore d'APK compilé ni de pipeline de publication dans ce dépôt. Les autorisations pour « Toutes les photos » varient selon la version d'Android ; l'utilisateur doit accorder l'accès complet si demandé.
