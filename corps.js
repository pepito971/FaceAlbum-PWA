// FaceAlbum v10 — détection locale des corps et comparaison d'apparence.
// MediaPipe EfficientDet localise les personnes ; MobileNetV3 compare les
// régions détectées. Ce système NE reconnaît PAS une identité.
let promesseDetecteurCorps = null;

async function initialiserDetecteurCorps() {
  if (!promesseDetecteurCorps) {
    promesseDetecteurCorps = (async () => {
      const {ObjectDetector, FilesetResolver} = await import(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/+esm"
      );
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
      );
      return ObjectDetector.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float32/1/efficientdet_lite0.tflite"
        },
        runningMode: "IMAGE",
        scoreThreshold: 0.35,
        categoryAllowlist: ["person"],
        maxResults: 4
      });
    })().catch(erreur => {
      promesseDetecteurCorps = null;
      throw erreur;
    });
  }
  return promesseDetecteurCorps;
}

function vecteurDeCorps(resultat) {
  const valeurs = resultat.embeddings?.[0]?.floatEmbedding;
  if (!valeurs?.length) throw new Error("Empreinte de personne vide");
  return Array.from(valeurs);
}

// Fabriquer une vignette éphémère du corps détecté (aucune image sauvegardée).
function empreinteCorpsDepuisImage(image, bbox, modeleVisuel) {
  const x = Math.max(0, bbox.originX - bbox.width * 0.035);
  const y = Math.max(0, bbox.originY - bbox.height * 0.035);
  const w = Math.min(image.width - x, bbox.width * 1.07);
  const h = Math.min(image.height - y, bbox.height * 1.07);
  if (w < 12 || h < 16) return null;

  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 224;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponible");

  ctx.drawImage(image, x, y, w, h, 0, 0, 224, 224);
  const entier = vecteurDeCorps(modeleVisuel.embed(canvas));
  // Partie haute : peut capter le haut du corps et les vêtements.
  // Ce n'est pas une reconnaissance biométrique de morphologie.
  ctx.clearRect(0, 0, 224, 224);
  ctx.drawImage(image, x, y, w, h * 0.64, 0, 0, 224, 224);
  const haut = vecteurDeCorps(modeleVisuel.embed(canvas));
  return {entier, haut};
}

function scoreApparencesCorps(a, b) {
  return (
    0.65 * similitudeVecteurs(a.entier, b.entier) +
    0.35 * similitudeVecteurs(a.haut, b.haut)
  );
}

async function analyserApparencesCorps(photos, progression = () => {}) {
  if (photos.length < 2) {
    return {comparaisons: [], groupes: [], photosAvecCorps: 0,
      personnesDetectees: 0, erreursPhotos: []};
  }

  progression("Chargement du détecteur de personnes (téléchargement initial possible)...");
  const detecteur = await initialiserDetecteurCorps();
  // Réutilise l'embedder MobileNet de l'analyse des scènes.
  progression("Chargement du modèle de comparaison des vêtements...");
  const modele = await initialiserModeleVisuel();
  const empreintes = [];
  const erreursPhotos = [];
  let personnesDetectees = 0;
  let photosAvecCorps = 0;

  for (let i = 0; i < photos.length; i++) {
    progression("Analyse des corps : photo " + (i + 1) + "/" + photos.length);
    let image = null;
    try {
      image = await createImageBitmap(photos[i]);
      const detections = (detecteur.detect(image).detections || [])
        .filter(d => d.boundingBox &&
          d.categories?.some(c => c.categoryName === "person" && c.score >= 0.35))
        .sort((a, b) =>
          b.boundingBox.width * b.boundingBox.height -
          a.boundingBox.width * a.boundingBox.height)
        .slice(0, 3);
      personnesDetectees += detections.length;
      if (detections.length) photosAvecCorps++;
      const signatures = [];
      for (const detection of detections) {
        try {
          const signature = empreinteCorpsDepuisImage(
            image, detection.boundingBox, modele);
          if (signature) signatures.push(signature);
        } catch (erreur) {
          console.warn("Corps non comparable", erreur);
        }
      }
      empreintes.push(signatures);
    } catch (erreur) {
      erreursPhotos.push("Photo " + (i + 1) + " : " +
        String(erreur?.message || erreur).slice(0, 140));
      empreintes.push([]);
    } finally {
      if (image) image.close();
    }
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  const comparaisons = [];
  for (let i = 0; i < empreintes.length; i++) {
    for (let j = i + 1; j < empreintes.length; j++) {
      if (!empreintes[i].length || !empreintes[j].length) continue;
      let score = -1;
      for (const a of empreintes[i]) {
        for (const b of empreintes[j]) {
          score = Math.max(score, scoreApparencesCorps(a, b));
        }
      }
      comparaisons.push({indices: [i, j], score});
    }
  }
  comparaisons.sort((a, b) => b.score - a.score);

  // Une piste de groupe exige une ressemblance de corps pour chaque paire.
  // Une tenue semblable peut tromper : seule l'approbation humaine fait foi.
  const groupes = [];
  const utilises = new Set();
  const scorePaire = (a, b) => comparaisons.find(p =>
    p.indices[0] === Math.min(a, b) &&
    p.indices[1] === Math.max(a, b))?.score ?? -1;
  for (const paire of comparaisons) {
    if (paire.score < 0.80) break;
    if (utilises.has(paire.indices[0]) || utilises.has(paire.indices[1])) continue;
    const indices = paire.indices.slice();
    for (let k = 0; k < photos.length; k++) {
      if (indices.includes(k) || utilises.has(k)) continue;
      if (indices.every(j => scorePaire(j, k) >= 0.76)) indices.push(k);
    }
    if (indices.length >= 3) {
      groupes.push({indices: indices.sort((a, b) => a - b),
        raison: "apparences de corps similaires — identité non confirmée"});
      indices.forEach(i => utilises.add(i));
    }
    if (groupes.length >= 4) break;
  }

  return {comparaisons, groupes, photosAvecCorps, personnesDetectees, erreursPhotos};
}
