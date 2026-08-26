import { test } from "node:test";
import assert from "node:assert/strict";
import { audit, contextAt, extractPhpPoints, extractPoints, fingerprint, groupByExpression, type Classification } from "./unescaped.ts";

const template = `<div class="wrap">
  <p>{{ block.getChildHtml('safe')|raw }}</p>
  <span data-x="{{ value|raw }}">text</span>
  <script type="application/json">{{ config|raw }}</script>
  <style>{{ css|raw }}</style>
  {# {{ dead|raw }} #}
</div>`;

const points = extractPoints("Some_Module/templates/thing.twig", template);

test("every unescaped point outside a comment is found", () => {
    assert.deepEqual(points.map((point) => point.expression), [
        "block.getChildHtml('...')",
        "value",
        "config",
        "css",
    ]);
});

test("a raw filter inside a twig comment is not an output point", () => {
    assert.ok(!points.some((point) => point.expression === "dead"));
});

test("the emission context is read from the markup around the point", () => {
    assert.deepEqual(points.map((point) => point.context), ["text", "attribute", "script", "style"]);
});

test("the line number points at the raw filter", () => {
    assert.deepEqual(points.map((point) => point.line), [2, 3, 4, 5]);
});

test("string literals collapse so the same call in two files groups together", () => {
    const other = extractPoints("Other/templates/x.twig", `<p>{{ block.getChildHtml('different')|raw }}</p>`);
    assert.equal(other[0].expression, points[0].expression);
});

test("the fingerprint changes when the emission context changes", () => {
    assert.notEqual(fingerprint("a.twig", "value", "text"), fingerprint("a.twig", "value", "attribute"));
});

test("a point outside any tag is text", () => {
    assert.equal(contextAt("<p>hello  world", 10), "text");
});

const classify = (overrides: Partial<Classification> = {}): Classification => ({
    fingerprint: points[0].fingerprint,
    file: points[0].file,
    expression: points[0].expression,
    context: points[0].context,
    origin: "core-block",
    reason: "markup another block already rendered",
    ...overrides,
});

test("an unclassified point is reported", () => {
    const findings = audit(points, [classify()]);
    assert.equal(findings.filter((finding) => finding.rule === "unclassified").length, 3);
});

test("end-user content with no declared guarantee is a security defect", () => {
    const findings = audit([points[0]], [classify({ origin: "user-input" })]);
    assert.deepEqual(findings.map((finding) => finding.rule), ["user-input-unescaped"]);
});

test("end-user content with a declared guarantee passes", () => {
    const findings = audit([points[0]], [classify({ origin: "user-input", guarantee: "the accessor escapes it" })]);
    assert.deepEqual(findings, []);
});

test("a recorded defect keeps being reported rather than passing quietly", () => {
    const findings = audit([points[0]], [classify({ defect: { severity: "major", detail: "core escapes this and we do not" } })]);
    assert.deepEqual(findings.map((finding) => finding.rule), ["known-defect"]);
});

test("a classification whose point moved context is reported as stale", () => {
    const moved = classify({ context: "attribute", fingerprint: fingerprint(points[0].file, points[0].expression, "attribute") });
    const findings = audit([points[0]], [moved]);
    assert.deepEqual(findings.map((finding) => finding.rule).sort(), ["stale-classification", "unclassified"]);
});

test("points group by expression with the contexts they appear in", () => {
    const groups = groupByExpression(points);
    assert.equal(groups.length, 4);
    assert.deepEqual(groups[0].contexts.length, 1);
});

const php = `<?php $title = $escaper->escapeHtml($block->getTitle()); ?>
<div class="wrap">
  <h1><?= $escaper->escapeHtml($block->getHeading()) ?></h1>
  <p><?= /* @noEscape */ $title ?></p>
  <span><?= $block->getChildHtml() ?></span>
  <a href="<?= $styleHref ?>">link</a>
  <em><?= $block->escapeHtmlAttr($value) ?></em>
</div>`;

const phpPoints = extractPhpPoints("Some_Module/templates/thing.phtml", php);

test("an echo wrapped in an escaper is not an output point", () => {
    assert.ok(!phpPoints.some((point) => point.expression.includes("getHeading")));
    assert.ok(!phpPoints.some((point) => point.expression.includes("$value")));
});

test("an echo with no escaper is an output point", () => {
    assert.deepEqual(phpPoints.map((point) => point.expression), [
        "$title",
        "$block->getChildHtml()",
        "$styleHref",
    ]);
});

test("an escaped echo marked noEscape is still audited, because the marker is the claim", () => {
    const marked = extractPhpPoints("x.phtml", `<p><?= /* @noEscape */ $escaper->escapeHtml($v) ?></p>`);
    assert.equal(marked.length, 1);
});

test("the php echo carries the markup context it sits in", () => {
    assert.deepEqual(phpPoints.map((point) => point.context), ["text", "text", "attribute"]);
});
