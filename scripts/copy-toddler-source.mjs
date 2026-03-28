import { copyFileSync, mkdirSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

/** Путь к исходнику на OneDrive Desktop (кириллица). */
const SRC = join("C:", "Users", "alesa", "OneDrive", "Рабочий стол", "toddler_12_36_months_snack_stage1.txt");
const DST = join(root, "data", "toddler-seed", "toddler_12_36_months_multimeal.source.txt");

if (!existsSync(SRC)) {
  console.error("Не найден файл:", SRC);
  process.exit(1);
}
mkdirSync(dirname(DST), { recursive: true });
copyFileSync(SRC, DST);
console.log("Скопировано →", DST);
