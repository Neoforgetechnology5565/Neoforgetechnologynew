export interface Supplier { id: string; name: string; contact: string; email: string; phone: string; country: string; category: string; rating: number; terms: string; status: "Active" | "On hold"; notes: string }
export interface ReqLine { productId: string; qty: number; price: number }
export interface Requisition { id: string; number: string; requesterId: string; date: string; dept: string; status: "Draft" | "Submitted" | "Approved" | "Rejected" | "Converted"; lines: ReqLine[]; justification: string; approverId?: string; decidedAt?: string; decisionNote?: string; poId?: string }
export interface PoLine { productId: string; qty: number; price: number; received: number }
export interface Receipt { id: string; number: string; date: string; whId: string; by: string; note: string; lines: { productId: string; qty: number }[] }
export interface PurchaseOrder { id: string; number: string; supplierId: string; date: string; expected: string; status: "Draft" | "Sent" | "Partially received" | "Received" | "Cancelled"; lines: PoLine[]; terms: string; whId: string; reqId?: string; notes: string; receipts: Receipt[] }

const S = (id: string, name: string, contact: string, country: string, category: string, rating: number, terms: string, status: Supplier["status"] = "Active", notes = ""): Supplier => ({ id, name, contact, country, category, rating, terms, status, notes, email: `orders@${name.toLowerCase().replace(/[^a-z]+/g, "")}.example`, phone: `+${country === "USA" ? "1 512" : "44 20"} 555 0${id.slice(1).padStart(3, "0")}` });
/** Receipts that already happened in the seed data: the Inventory demo's seed adds matching stock movements so both stay consistent. */
export const SEED_RECEIPTS: { poNumber: string; date: string; whId: string; unitCosts: Record<string, number>; lines: { productId: string; qty: number }[] }[] = [
  { poNumber: "PO-4001", date: "2025-12-18", whId: "w1", unitCosts: { p11: 0.46, p12: 0.96, p14: 1.8 }, lines: [{ productId: "p11", qty: 3000 }, { productId: "p12", qty: 2000 }, { productId: "p14", qty: 400 }] },
  { poNumber: "PO-4002", date: "2026-01-22", whId: "w1", unitCosts: { p4: 108, p5: 58 }, lines: [{ productId: "p4", qty: 30 }, { productId: "p5", qty: 40 }] },
  { poNumber: "PO-4003", date: "2026-02-05", whId: "w1", unitCosts: { p16: 11, p17: 6.4 }, lines: [{ productId: "p16", qty: 150 }, { productId: "p17", qty: 200 }] },
  { poNumber: "PO-4004", date: "2026-03-09", whId: "w1", unitCosts: { p4: 110, p1: 84 }, lines: [{ productId: "p4", qty: 25 }, { productId: "p1", qty: 20 }] },
];
const rc = (n: string, i: number) => { const r = SEED_RECEIPTS.find((x) => x.poNumber === n)!; return { id: `rc${i}`, number: `GRN-${n.slice(3)}-1`, date: r.date, whId: r.whId, by: "e21", note: i === 4 ? "First delivery (partial)" : "Delivery complete", lines: r.lines } as Receipt; };
const PO = (n: number, supplierId: string, date: string, expected: string, status: PurchaseOrder["status"], lines: PoLine[], extra: Partial<PurchaseOrder> = {}): PurchaseOrder => ({ id: `po${n}`, number: `PO-${n}`, supplierId, date, expected, status, lines, terms: "Net 30", whId: "w1", notes: "", receipts: [], ...extra });

export const seedProc = () => ({
  suppliers: [
    S("s1", "Apex Office Supplies", "Dana Fields", "USA", "Consumables", 4, "Net 30"), S("s2", "CloudNimbus Hosting", "Arjun Rao", "USA", "Cloud services", 5, "Net 30"), S("s3", "Brightline Telecom", "Helen Cho", "UK", "Telecom", 3, "Net 45"),
    S("s4", "Steelcraft Fixtures", "Marco Bellini", "Italy", "Furniture", 4, "Net 30"), S("s5", "Orion Electronics Distribution", "Lena Fischer", "Germany", "Electronics", 5, "Net 30"), S("s6", "Greenleaf Packaging", "Tomás Rivera", "Netherlands", "Packaging", 4, "Net 30"),
    S("s7", "Forge & Tool Wholesale", "Sipho Dlamini", "USA", "Tools & hardware", 3, "Net 15", "Active", "Minimum order $500."), S("s8", "Paragon Professional Services", "Rachel Moore", "UK", "Professional services", 4, "Net 30"),
    S("s9", "Ironclad Safety Supply", "Gus Palmer", "USA", "Safety equipment", 4, "Net 30"), S("s10", "Summit Logistics", "Ivo Petrov", "Netherlands", "Freight", 2, "Net 30", "On hold", "On hold after two late deliveries."),
  ] as Supplier[],
  requisitions: [
    { id: "rq1", number: "REQ-101", requesterId: "e22", date: "2026-03-11", dept: "Operations", status: "Submitted", lines: [{ productId: "p13", qty: 60, price: 14 }], justification: "Bubble wrap is below the reorder level." },
    { id: "rq2", number: "REQ-102", requesterId: "e21", date: "2026-03-05", dept: "Operations", status: "Approved", lines: [{ productId: "p16", qty: 100, price: 11 }, { productId: "p17", qty: 100, price: 6.4 }], justification: "Site expansion needs more PPE.", approverId: "e20", decidedAt: "2026-03-07", decisionNote: "Approved within budget." },
    { id: "rq3", number: "REQ-103", requesterId: "e24", date: "2026-03-02", dept: "Customer Support", status: "Rejected", lines: [{ productId: "p5", qty: 10, price: 58 }], justification: "Docks for the new agents.", approverId: "e20", decidedAt: "2026-03-04", decisionNote: "Use existing spares first." },
    { id: "rq4", number: "REQ-104", requesterId: "e14", date: "2026-03-13", dept: "Engineering", status: "Draft", lines: [{ productId: "p3", qty: 5, price: 118 }], justification: "Test lab network refresh." },
    { id: "rq5", number: "REQ-105", requesterId: "e22", date: "2026-03-09", dept: "Operations", status: "Converted", lines: [{ productId: "p20", qty: 15, price: 77 }], justification: "Maintenance team drills.", approverId: "e20", decidedAt: "2026-03-10", decisionNote: "Approved.", poId: "po5" },
    { id: "rq6", number: "REQ-106", requesterId: "e20", date: "2026-03-12", dept: "Operations", status: "Submitted", lines: [{ productId: "p24", qty: 20, price: 57 }], justification: "Printer toner for the packing stations." },
  ] as Requisition[],
  orders: [
    PO(4001, "s6", "2025-12-02", "2025-12-18", "Received", [{ productId: "p11", qty: 3000, price: 0.46, received: 3000 }, { productId: "p12", qty: 2000, price: 0.96, received: 2000 }, { productId: "p14", qty: 400, price: 1.8, received: 400 }], { receipts: [rc("PO-4001", 1)] }),
    PO(4002, "s5", "2026-01-08", "2026-01-22", "Received", [{ productId: "p4", qty: 30, price: 108, received: 30 }, { productId: "p5", qty: 40, price: 58, received: 40 }], { receipts: [rc("PO-4002", 2)] }),
    PO(4003, "s9", "2026-01-26", "2026-02-05", "Received", [{ productId: "p16", qty: 150, price: 11, received: 150 }, { productId: "p17", qty: 200, price: 6.4, received: 200 }], { receipts: [rc("PO-4003", 3)] }),
    PO(4004, "s5", "2026-02-24", "2026-03-20", "Partially received", [{ productId: "p4", qty: 40, price: 110, received: 25 }, { productId: "p1", qty: 20, price: 84, received: 20 }, { productId: "p6", qty: 10, price: 305, received: 0 }], { receipts: [rc("PO-4004", 4)], notes: "Tablets back-ordered by the supplier." }),
    PO(4005, "s7", "2026-03-11", "2026-03-25", "Sent", [{ productId: "p20", qty: 15, price: 77, received: 0 }], { reqId: "rq5", terms: "Net 15" }),
    PO(4006, "s1", "2026-03-12", "2026-03-22", "Sent", [{ productId: "p24", qty: 40, price: 57, received: 0 }, { productId: "p23", qty: 60, price: 21.5, received: 0 }]),
    PO(4007, "s6", "2026-03-14", "2026-03-28", "Draft", [{ productId: "p13", qty: 80, price: 14, received: 0 }]),
    PO(4008, "s4", "2026-02-10", "2026-03-01", "Cancelled", [{ productId: "p7", qty: 20, price: 139, received: 0 }], { notes: "Cancelled: supplier price change." }),
  ] as PurchaseOrder[],
  nextNo: { req: 107, po: 4009, grn: 5 },
});
