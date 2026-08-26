import { test } from "node:test";
import assert from "node:assert/strict";
import { attribute, normaliseSql, parseQueryLog, report, shorten, table, withoutEntry } from "./queryLog.ts";

const block = (seq: number, sql: string, caller: string, line = 42) => `## 2026-08-26 06:13:12
## ${seq} ## QUERY
SQL: ${sql}
AFF: 0
TIME: 0.0017
TRACE: #1 Magento\\Framework\\DB\\Logger\\File[Magento\\Framework\\DB\\Logger\\LoggerAbstract]#000000000000008e0000000000000000#->getCallStack() called at [vendor/magento/framework/DB/Logger/LoggerAbstract.php:170]
#2 Magento\\Framework\\DB\\Adapter\\Pdo\\Mysql\\Interceptor[Zend_Db_Adapter_Abstract]#000000000000000e0000000000000000#->query('SELECT...') called at [vendor/magento/zend-db/library/Zend/Db/Adapter/Abstract.php:316]
#3 Magento\\UrlRewrite\\Model\\Storage\\DbStorage#00000000000001fb0000000000000000#->doFindOneByData(array()) called at [${caller}:${line}]
#4 Magento\\Framework\\App\\Http#00000000000000a30000000000000000#->launch() called at [pub/index.php:30]

`;

test("a log with two blocks parses into two queries", () => {
    const raw = block(1, "SELECT * FROM `url_rewrite` WHERE id = 3", "app/code/X.php") +
        block(2, "SELECT * FROM `url_rewrite` WHERE id = 4", "app/code/X.php");
    const blocks = parseQueryLog(raw);
    assert.equal(blocks.length, 2);
    assert.equal(blocks[0].kind, "QUERY");
    assert.equal(blocks[0].frames.length, 4);
    assert.equal(blocks[0].entry, "pub/index.php");
    assert.ok(blocks[0].timeMs > 1.6 && blocks[0].timeMs < 1.8);
});

test("attribution skips the database plumbing and names the first application frame", () => {
    const frames = parseQueryLog(block(1, "SELECT 1", "vendor/mage-obsidian/module-storefront/ViewModel/Navigation.php", 88))[0].frames;
    const origin = attribute(frames);
    assert.equal(origin.file, "vendor/mage-obsidian/module-storefront/ViewModel/Navigation.php");
    assert.equal(origin.line, 88);
    assert.equal(origin.call, "DbStorage->doFindOneByData");
    assert.equal(origin.inObsidian, true);
});

test("a query issued by core is not attributed to the theme", () => {
    const frames = parseQueryLog(block(1, "SELECT 1", "vendor/magento/module-catalog/Block/Category.php"))[0].frames;
    assert.equal(attribute(frames).inObsidian, false);
});

test("normalising a query collapses its literals so repeats collide", () => {
    const first = normaliseSql("SELECT * FROM `url_rewrite` WHERE `entity_id` = 12 AND `store_id` IN ('1')");
    const second = normaliseSql("SELECT * FROM `url_rewrite` WHERE `entity_id` = 4471 AND `store_id` IN ('2')");
    assert.equal(first, second);
});

test("an IN list of any length normalises to one placeholder", () => {
    assert.equal(normaliseSql("SELECT 1 WHERE a IN ('x','y','z')"), normaliseSql("SELECT 1 WHERE a IN ('q')"));
});

test("the table a query reads is recovered from its text", () => {
    assert.equal(table("SELECT `url_rewrite`.* FROM `url_rewrite` WHERE 1"), "url_rewrite");
    assert.equal(table("INSERT INTO `search_query` (a) VALUES (1)"), "search_query");
});

test("a query repeated once per collection item is reported with its count and origin", () => {
    const raw = Array.from({ length: 7 }, (_, i) =>
        block(i, `SELECT * FROM \`url_rewrite\` WHERE id = ${i}`, "vendor/mage-obsidian/module-storefront/ViewModel/Navigation.php", 88),
    ).join("");
    const result = report(parseQueryLog(raw), 5);
    assert.equal(result.total, 7);
    assert.equal(result.repeated.length, 1);
    assert.equal(result.repeated[0].count, 7);
    assert.equal(result.repeated[0].table, "url_rewrite");
    assert.ok(result.repeated[0].origin.includes("Navigation.php:88"));
    assert.equal(result.repeated[0].inObsidian, true);
});

test("a query issued fewer times than the threshold is not a repeated pattern", () => {
    const raw = Array.from({ length: 3 }, (_, i) => block(i, `SELECT * FROM \`t\` WHERE id = ${i}`, "app/code/X.php")).join("");
    assert.deepEqual(report(parseQueryLog(raw), 5).repeated, []);
});

test("the same query from two origins is counted per origin", () => {
    const raw =
        Array.from({ length: 5 }, (_, i) => block(i, `SELECT * FROM \`t\` WHERE id = ${i}`, "app/code/A.php")).join("") +
        Array.from({ length: 5 }, (_, i) => block(i, `SELECT * FROM \`t\` WHERE id = ${i}`, "app/code/B.php")).join("");
    const result = report(parseQueryLog(raw), 5);
    assert.equal(result.repeated.length, 2);
    assert.deepEqual(result.byOrigin.map((o) => o.count), [5, 5]);
});

test("blocks from another entry point are dropped before counting", () => {
    const raw = block(1, "SELECT 1", "app/code/X.php").replace("pub/index.php", "pub/health_check.php") + block(2, "SELECT 2", "app/code/X.php");
    assert.equal(withoutEntry(parseQueryLog(raw), "health_check").length, 1);
});

test("a query whose stack passes through MageObsidian names the requester", () => {
    const raw = block(1, "SELECT 1", "vendor/magento/module-url-rewrite/Model/Storage/DbStorage.php", 123).replace(
        "#4 Magento\\Framework\\App\\Http#00000000000000a30000000000000000#->launch() called at [pub/index.php:30]",
        "#4 Magento\\UrlRewrite\\Model\\UrlFinder#00000000000000a30000000000000000#->findOneByData(array()) called at [/home/who/ObsidianProject/module-storefront/src/Model/Navigation/MenuTree.php:214]\n#5 Magento\\Framework\\App\\Http#00000000000000a30000000000000000#->launch() called at [pub/index.php:30]",
    );
    const origin = attribute(parseQueryLog(raw)[0].frames);
    assert.equal(origin.inObsidian, true);
    assert.equal(origin.requestedBy, "module-storefront/src/Model/Navigation/MenuTree.php:214");
    assert.equal(origin.file, "vendor/magento/module-url-rewrite/Model/Storage/DbStorage.php");
});

test("an absolute path outside the project is left alone", () => {
    assert.equal(shorten("vendor/magento/framework/DB/Select.php"), "vendor/magento/framework/DB/Select.php");
});

test("a stack with no MageObsidian frame has no requester", () => {
    const origin = attribute(parseQueryLog(block(1, "SELECT 1", "vendor/magento/module-catalog/Block/Category.php"))[0].frames);
    assert.equal(origin.requestedBy, null);
    assert.equal(origin.inObsidian, false);
});
