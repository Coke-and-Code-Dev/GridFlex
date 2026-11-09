import { loadFont as loadArchivo } from "@remotion/google-fonts/Archivo";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";

const archivo = loadArchivo("normal", { weights: ["500", "700", "800", "900"], subsets: ["latin"] });
const mono = loadMono("normal", { weights: ["500", "700"], subsets: ["latin"] });

export const HEAD = archivo.fontFamily;
export const MONO = mono.fontFamily;
