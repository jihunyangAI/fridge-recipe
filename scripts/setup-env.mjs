// .env에 3단계용 변수가 없으면 추가한다. 이미 있는 값은 건드리지 않고, 값은 화면에 출력하지 않는다.
// 실행: npm run setup:env
import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, readFileSync } from "node:fs";

const FILE = ".env";
const content = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";
const has = (name) => new RegExp(`^\\s*${name}\\s*=\\s*\\S`, "m").test(content);

const additions = [];
if (!has("AUTH_SECRET")) additions.push(["AUTH_SECRET", randomBytes(32).toString("base64url")]);
if (!has("DATABASE_URL")) additions.push(["DATABASE_URL", "file:data/app.db"]);

if (additions.length === 0) {
  console.log("변경 없음: AUTH_SECRET, DATABASE_URL이 이미 있습니다.");
} else {
  const prefix = content && !content.endsWith("\n") ? "\n" : "";
  appendFileSync(FILE, prefix + additions.map(([k, v]) => `${k}=${v}`).join("\n") + "\n");
  console.log(`추가함: ${additions.map(([k]) => k).join(", ")} (값은 출력하지 않음)`);
}
