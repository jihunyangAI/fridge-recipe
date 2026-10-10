// .env에 3단계용 변수가 없거나 비어 있으면 채운다. 이미 값이 있으면 건드리지 않고, 값은 화면에 출력하지 않는다.
// 실행: npm run setup:env
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

// ENV_FILE은 테스트용 (다른 이름의 임시 파일로 동작을 확인할 때)
const FILE = process.env.ENV_FILE || ".env";
let content = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";

const defaults = {
  AUTH_SECRET: () => randomBytes(32).toString("base64url"),
  DATABASE_URL: () => "file:data/app.db",
};

const changed = [];
for (const [name, makeValue] of Object.entries(defaults)) {
  // \s는 줄바꿈까지 넘어가 다음 줄을 값으로 착각하므로, 같은 줄의 공백·탭만 허용한다.
  const filled = new RegExp(`^[ \\t]*${name}[ \\t]*=[ \\t]*\\S`, "m");
  const empty = new RegExp(`^[ \\t]*${name}[ \\t]*=[ \\t]*\\r?$`, "m");
  if (filled.test(content)) continue;
  if (empty.test(content)) {
    // .env.example을 복사해 "AUTH_SECRET="처럼 빈 줄이 있으면 그 줄을 채운다.
    content = content.replace(empty, `${name}=${makeValue()}`);
  } else {
    content += `${content && !content.endsWith("\n") ? "\n" : ""}${name}=${makeValue()}\n`;
  }
  changed.push(name);
}

if (changed.length === 0) {
  console.log("변경 없음: AUTH_SECRET, DATABASE_URL이 이미 있습니다.");
} else {
  writeFileSync(FILE, content);
  console.log(`채움: ${changed.join(", ")} (값은 출력하지 않음)`);
}
