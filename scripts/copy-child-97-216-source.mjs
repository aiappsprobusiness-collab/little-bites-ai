import { copyFileSync, mkdirSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const SRC = join("C:", "Users", "alesa", "OneDrive", "Рабочий стол", "child_97_216_months_snack_stage1.txt");
const DST = join(root, "data", "toddler-seed", "child_97_216_months_multimeal.source.txt");

if (!existsSync(SRC)) {
  console.error("Не найден файл:", SRC);
  process.exit(1);
}
mkdirSync(dirname(DST), { recursive: true });
copyFileSync(SRC, DST);
console.log("Скопировано →", DST);
