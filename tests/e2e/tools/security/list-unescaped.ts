import { collectPoints } from "./themeTemplates.ts";

const wanted = process.argv[2];
for (const point of collectPoints()) {
    if (wanted && point.context !== wanted) {
        continue;
    }
    console.log(`${point.fingerprint}  ${point.context.padEnd(9)}  ${point.file}:${point.line}  ${point.expression}`);
}
