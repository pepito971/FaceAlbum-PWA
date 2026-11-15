// FaceAlbum — comparaison d'images par modèle MobileNetV3 de MediaPipe.
// Le modèle s'exécute dans le navigateur : aucune image n'est transmise au serveur.
// Il compare les sujets / scènes / vêtements visibles, PAS l'identité des personnes.
let promesseModeleVisuel = null;

async function initialiserModeleVisuel() {
  if (!promesseModeleVisuel) {
    promesseModeleVisuel = (async () => {
      const { ImageEmbedder, FilesetResolver } = await import(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/+esm"
      );
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
      );
      return ImageEmbedder.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/image_embedder/mobilenet_v3_small/float32/1/mobilenet_v3_small.tflite"
        },
        runningMode: "IMAGE",
        l2Normalize: true
      });
    })().catch(erreur => {
      promesseModeleVisuel = null; // réessayer à la prochaine analyse
      throw erreur;
    });
  }
  return promesseModeleVisuel;
}

function vecteurImage(resultat) {
  const valeurs = resultat.embeddings?.[0]?.floatEmbedding;
  if (!valeurs || !valeurs.length) throw new Error("Empreinte IA non disponible");
  return Array.from(valeurs);
}

async function calculerRepresentationVisuelle(modele, photo) {
  const image = await createImageBitmap(photo);
  try {
    const scene = vecteurImage(modele.embed(image));
    // La région centrale peut contenir un corps ou des vêtements ;
    // ce n'est pas une découpe fiable de la personne.
    const canvas = document.createElement("canvas");
    canvas.width = 224;
    canvas.height = 224;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas indisponible");
    ctx.drawImage(image,
      image.width * 0.16, image.height * 0.06,
      image.width * 0.68, image.height * 0.88,
      0, 0, canvas.width, canvas.height);
    const centre = vecteurImage(modele.embed(canvas));
    return {scene, centre};
  } finally {
    image.close();
  }
}

function similitudeVecteurs(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let produit = 0, normeA = 0, normeB = 0;
  for (let i = 0; i < a.length; i++) {
    produit += a[i] * b[i];
    normeA += a[i] * a[i];
    normeB += b[i] * b[i];
  }
  return normeA && normeB ? produit / Math.sqrt(normeA * normeB) : 0;
}

// Des propositions à examiner, et jamais des regroupements automatiques.
async function suggererAvecIA(photos, progression = () => {}) {
  progression("Chargement du modèle d'analyse visuelle (première utilisation : téléchargement)...");
  const modele = await initialiserModeleVisuel();
  const representations = [];
  const erreursPhotos = [];
  for (let i = 0; i < photos.length; i++) {
    progression("IA visuelle : photo " + (i + 1) + "/" + photos.length);
    try {
      representations.push(await calculerRepresentationVisuelle(modele, photos[i]));
    } catch (erreur) {
      console.warn("Impossible de comparer la photo " + (i + 1), erreur);
      erreursPhotos.push("Photo " + (i + 1) + " : " + String(erreur?.message || erreur).slice(0, 180));
      representations.push(null);
    }
    // Permet au téléphone d'actualiser le compteur.
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  const correspondances = [];
  for (let i = 0; i < representations.length; i++) {
    for (let j = i + 1; j < representations.length; j++) {
      const a = representations[i], b = representations[j];
      if (!a || !b) continue;
      const scene = similitudeVecteurs(a.scene, b.scene);
      const apparence = similitudeVecteurs(a.centre, b.centre);
      const score = scene * 0.8 + apparence * 0.2;
      correspondances.push({
        a: i, b: j, score,
        forte: scene >= 0.86 || (scene >= 0.79 && apparence >= 0.88),
        raison: "sujets / scènes visuellement proches (IA)"
      });
    }
  }
  correspondances.sort((a, b) => b.score - a.score);
  const fortes = correspondances.filter(p => p.forte);
  const groupes = [];
  const utilises = new Set();

  // Exiger que chaque nouvelle photo ressemble aux autres du groupe.
  for (const lien of fortes) {
    if (utilises.has(lien.a) || utilises.has(lien.b)) continue;
    const indices = [lien.a, lien.b];
    for (let k = 0; k < photos.length; k++) {
      if (indices.includes(k) || utilises.has(k)) continue;
      if (indices.every(j => fortes.some(p =>
        (p.a === j && p.b === k) || (p.a === k && p.b === j)))) {
        indices.push(k);
      }
    }
    indices.forEach(i => utilises.add(i));
    groupes.push({indices: indices.sort((a, b) => a - b),
      raison: "sujets / scènes / apparences similaires (IA) — à vérifier"});
    if (groupes.length >= 6) break;
  }
  // Si rien n'est assez sûr, afficher seulement la meilleure piste quand
  // la similarité est assez élevée, sans la présenter comme une identité.
  if (!groupes.length && correspondances[0]?.score >= 0.72) {
    const p = correspondances[0];
    groupes.push({
      indices: [p.a, p.b],
      raison: "piste visuelle à vérifier (ressemblance incertaine)"
    });
  }
  // Les scores restent des similarités mathématiques, pas des certitudes.
  // Les fournir même lorsqu'aucune paire ne franchit le seuil de suggestion.
  const comparaisons = correspondances.map(({a, b, score}) => ({
    indices: [a, b],
    score
  }));
  return {
    groupes,
    comparaisons,
    nombrePaires: comparaisons.length,
    nombrePhotosComparees: representations.filter(Boolean).length,
    erreursPhotos
  };
}
