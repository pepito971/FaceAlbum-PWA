// FaceAlbum - Préparation de la reconnaissance des personnes
// La reconnaissance faciale n'est pas encore activée.
// Aucune photo n'est envoyée ni modifiée par ce module.

async function reconnaitrePersonnes(photos) {
  console.log("Reconnaissance en préparation...");
  console.log("Photos sélectionnées :", photos.length);

  return {
    groupes: [],
    nombrePhotos: photos.length,
    reconnaissanceActive: false
  };
}
