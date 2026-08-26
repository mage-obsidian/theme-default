import { test } from "node:test";
import assert from "node:assert/strict";
import { compareSurfaces, normalisePath, normaliseSurface, summarise, surfaceOf } from "./themeTree.ts";

const reference = surfaceOf([
    { module: "Magento_Msrp", path: "popup.phtml" },
    { module: "Magento_Msrp", path: "product/price/msrp.phtml" },
    { module: "Magento_Swatches", path: "product/swatch-item.phtml" },
    { module: "Magento_Swatches", path: "product/js/layered-swatch.phtml" },
]);

const ours = surfaceOf([
    { module: "Magento_Msrp", path: "product/price/msrp.phtml" },
    { module: "Magento_Multishipping", path: "checkout/overview.twig" },
]);

const comparison = compareSurfaces(normaliseSurface(reference), normaliseSurface(ours));
const by = (module: string) => comparison.find((entry) => entry.module === module)!;

test("a module both sides ship is reported as both, with what each side has alone", () => {
    const msrp = by("Magento_Msrp");
    assert.equal(msrp.verdict, "both");
    assert.deepEqual(msrp.shared, ["product/price/msrp"]);
    assert.deepEqual(msrp.onlyInReference, ["popup"]);
    assert.deepEqual(msrp.onlyInOurs, []);
});

test("a module only the reference ships is reported as reference-only with every template listed", () => {
    const swatches = by("Magento_Swatches");
    assert.equal(swatches.verdict, "reference-only");
    assert.equal(swatches.ourTemplates, 0);
    assert.deepEqual(swatches.onlyInReference, ["product/js/layeredswatch", "product/swatchitem"]);
});

test("a module only we ship is reported as ours-only", () => {
    assert.equal(by("Magento_Multishipping").verdict, "ours-only");
});

test("the two engines' extensions and separators never make the same template look unique", () => {
    assert.equal(normalisePath("product/swatch-item.phtml"), normalisePath("product/swatch_item.twig"));
    assert.equal(normalisePath("Product/View.PHTML"), "product/view");
});

test("the summary counts each module once", () => {
    const counts = summarise(comparison);
    assert.deepEqual(counts, { both: 1, "reference-only": 1, "ours-only": 1 });
});

test("a surface groups a module's templates and sorts them", () => {
    assert.deepEqual(surfaceOf([
        { module: "B", path: "z" },
        { module: "A", path: "b" },
        { module: "A", path: "a" },
    ]), [
        { module: "A", templates: ["a", "b"] },
        { module: "B", templates: ["z"] },
    ]);
});
