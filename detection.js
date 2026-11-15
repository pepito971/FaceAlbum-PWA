
let detecteurVisages = null;

async function initialiserDetection() {
  if (detecteurVisages) return detecteurVisages;

  const { FaceDetector, FilesetResolver } =
    await import(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/+esm"
    );

  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm"
  );

  detecteurVisages = await FaceDetector.createFromOptions(
    vision,
    {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite"
      },
      runningMode: "IMAGE",
      minDetectionConfidence: 0.5
    }
  );

  return detecteurVisages;
}

async function detecterVisages(photo) {
  const detecteur = await initialiserDetection();
  const image = await createImageBitmap(photo);

  try {
    const resultat = detecteur.detect(image);
    return {
      nombre: resultat.detections.length,
      visages: resultat.detections
    };
  } finally {
    image.close();
  }
}
