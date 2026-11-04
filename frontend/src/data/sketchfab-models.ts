export const SKETCHFAB_MODELS: Record<string, string> = {
  adalaj: "84c06a4c9a7b4258bb673bc87c19f310",
  "ajanta-caves": "0e0aa7dd247d4d818c9ecb1e7be3bcc6",
  charminar: "bb880d064036496ca14ebac08a243af0",
  "golden-temple": "f1d25df7f2f841209ae81468241a15d4",
  "golconda-fort": "4e088c7dcd094270813f59fe43821726",
  khajuraho: "dd99586619e74f24b8dec10cc009c360",
  konark: "52c2f9e811fe421a8b5e968e05372db2",
  meenakshi: "d5a5733adc884eecaa16d47295e4ab66",
  modhera: "662c08fc670246a0b9453818964b6568",
  "qutub-minar": "e165e25ec8f1497aa83ab72419f40ddc",
  "rani-ki-vav": "0ef39b30e2fe4d558424142e95e59999",
  sanchi: "2fd62cd6ee804455bda1ad0a324080cb",
  "shaniwar-wada": "6a4055758e6a463b9733c6c7e64f0c71",
  "taj-mahal": "875f29cfeb4a4518bb6516f775abcf37",
  "tawang-monastery": "465918a6ff0043b095ce190a7c4fc7f1",
  "toorji-ka-jhalra": "fc2857ccbd74465d8bfb12ec042911cc",
  "victoria-memorial": "1b3ec6a1a07949d08221f718fd1919d4",
};

/** Caveats for third-party models whose title or scope does not exactly match the site. */
export const SKETCHFAB_MODEL_NOTES: Record<string, string> = {
  khajuraho:
    "This third-party model is a generic temple study described by its creator as inspired by Khajuraho. It is not a measured reconstruction of the Kandariya Mahadeva or any other specific temple.",
  "taj-mahal":
    "This third-party model is titled “Taj Mahal Palace” and is presented as an interpretive view. It is not a survey-grade reconstruction of the Agra mausoleum.",
};

export const sketchfabEmbedUrl = (uid: string) =>
  `https://sketchfab.com/models/${uid}/embed?autostart=1&ui_infos=0&ui_watermark=0&ui_watermark_link=0&ui_help=0&ui_hint=0&ui_vr=0&ui_ar=0&ui_annotations=0&dnt=1`;

export const sketchfabModelUrl = (uid: string) => `https://sketchfab.com/models/${uid}`;
