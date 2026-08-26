import { collectPoints, templateFiles } from "./themeTemplates.ts";
import { groupByExpression } from "./unescaped.ts";

const points = collectPoints();

console.log(`${templateFiles().length} templates, ${points.length} unescaped output points`);

const contexts = new Map<string, number>();
for (const point of points) {
    contexts.set(point.context, (contexts.get(point.context) ?? 0) + 1);
}
console.log(
    "by context: " +
        [...contexts.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([context, count]) => `${context}=${count}`)
            .join(" "),
);

console.log("");
for (const group of groupByExpression(points)) {
    console.log(`${String(group.count).padStart(4)}  [${group.contexts.join(",")}]  ${group.expression}`);
}
