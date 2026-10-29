import assert from "node:assert/strict";
import { diffSlice, fillMissing, fromWire, toWire } from "./sync";

  const check = (n: string, f: () => void) => { f(); console.log("ok", n); };
const a = { items: [{ id: "1", n: 1 }, { id: "2", n: 2 }], cfg: { x: 1 }, tags: ["a"] };
check("returns null when nothing changed", () => { assert.equal(diffSlice("crm", a, { ...a }), null); });
check("sends only changed, added and removed records", () => {
    const d = diffSlice("crm", a, { ...a, items: [{ id: "1", n: 1 }, { id: "3", n: 3 }] })!;
    assert.deepEqual(d.upsert, { items: [{ id: "3", n: 3 }] });
    assert.deepEqual(d.delete, { items: ["2"] });
    assert.equal(d.order, undefined);
});
check("sends an order when a record is prepended", () => {
    const d = diffSlice("crm", a, { ...a, items: [{ id: "0", n: 0 }, ...a.items] })!;
    assert.deepEqual(d.order, { items: ["0", "1", "2"] });
});
check("sends scalars and drops emptied lists", () => {
    const d = diffSlice("crm", a, { ...a, cfg: { x: 2 }, tags: [] })!;
    assert.deepEqual(d.scalars, { cfg: { x: 2 } });
    assert.deepEqual(d.drop_scalars, ["tags"]);
});
check("deletes every record when a collection is emptied", () => {
    assert.deepEqual(diffSlice("crm", a, { ...a, items: [] })!.delete, { items: ["1", "2"] });
});
check("wraps the activity log", () => {
    assert.deepEqual(toWire("activity", [{ id: "x" }]), { items: [{ id: "x" }] });
    assert.deepEqual(fromWire("activity", { items: [1] }), [1]);
    assert.deepEqual(diffSlice("activity", [], [{ id: "x", text: "t" }])!.upsert, { items: [{ id: "x", text: "t" }] });
});
check("restores keys the server omitted without bringing seed rows back", () => {
    assert.deepEqual(fillMissing("crm", { cfg: { x: 1 } }, { items: [{ id: "1" }], cfg: { x: 9 }, tags: ["a"], note: "n" }), { cfg: { x: 1 }, items: [], tags: [], note: "n" });
});

