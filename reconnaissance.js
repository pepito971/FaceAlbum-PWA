// FaceAlbum : suggestions prudentes de visages visuellement similaires.
// Empreinte perceptuelle locale, utile surtout pour des photos très proches.
// Ce n'est PAS un modèle d'identification de personnes.
async function empreinteVisage(photo, detection) {
  if (!detection || !detection.boundingBox) return null;
  const bitmap = await createImageBitmap(photo);
  try {
    const b = detection.boundingBox;
    const x = Math.max(0, Math.floor(b.originX));
    const y = Math.max(0, Math.floor(b.originY));
    const largeur = Math.min(bitmap.width - x, Math.ceil(b.width));
    const hauteur = Math.min(bitmap.height - y, Math.ceil(b.height));
    if (largeur < 4 || hauteur < 4) return null;
    const canvas = document.createElement("canvas");
    canvas.width = 9;
    canvas.height = 8;
    const ctx = canvas.getContext("2d", {willReadFrequently: true});
    if (!ctx) return null;
    ctx.drawImage(bitmap, x, y, largeur, hauteur, 0, 0, 9, 8);
    const pixels = ctx.getImageData(0, 0, 9, 8).data;
    const gris = [];
    for (let i = 0; i < pixels.length; i += 4) {
      gris.push(pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114);
    }
    let bits = "";
    for (let ligne = 0; ligne < 8; ligne++) {
      for (let colonne = 0; colonne < 8; colonne++) {
        const i = ligne * 9 + colonne;
        bits += gris[i] > gris[i + 1] ? "1" : "0";
      }
    }
    return bits;
  } finally {
    bitmap.close();
  }
}

function distanceEmpreintes(a, b) {
  if (!a || !b || a.length !== b.length) return Infinity;
  let distance = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) distance++;
  return distance;
}

// analyses: [{photo, index, visages}], calculées par detection.js.
// Seules des ressemblances très fortes sont proposées, à confirmer.
async function reconnaitrePersonnes(analyses) {
  const entrees = [];
  for (const analyse of analyses) {
    const empreintes = [];
    for (const visage of analyse.visages || []) {
      try {
        const empreinte = await empreinteVisage(analyse.photo, visage);
        if (empreinte) empreintes.push(empreinte);
      } catch (erreur) {
        console.warn("Comparaison ignorée pour une photo", erreur);
      }
    }
    entrees.push({index: analyse.index, empreintes});
  }
  const parents = entrees.map((_, i) => i);
  const racine = i => {
    while (parents[i] !== i) i = parents[i];
    return i;
  };
  for (let i = 0; i < entrees.length; i++) {
    for (let j = i + 1; j < entrees.length; j++) {
      const proche = entrees[i].empreintes.some(a =>
        entrees[j].empreintes.some(b => distanceEmpreintes(a, b) <= 5));
      if (proche) parents[racine(j)] = racine(i);
    }
  }
  const candidats = new Map();
  entrees.forEach((entree, i) => {
    const r = racine(i);
    if (!candidats.has(r)) candidats.set(r, []);
    candidats.get(r).push(entree.index);
  });
  return {
    groupes: Array.from(candidats.values()).filter(indices => indices.length >= 2),
    reconnaissanceActive: false,
    methode: "ressemblance visuelle des visages (photos très proches)"
  };
}
