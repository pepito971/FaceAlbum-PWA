
async function detecterVisages(photo) {
  if (!("FaceDetector" in window)) {
    return {
      erreur: "Détection des visages non disponible dans ce navigateur."
    };
  }

  try {
    const image = await createImageBitmap(photo);
    const detecteur = new FaceDetector({
      fastMode: true,
      maxDetectedFaces: 20
    });

    const visages = await detecteur.detect(image);
    image.close();

    return {
      nombre: visages.length,
      visages: visages
    };
  } catch (erreur) {
    return { erreur: erreur.message };
  }
}
