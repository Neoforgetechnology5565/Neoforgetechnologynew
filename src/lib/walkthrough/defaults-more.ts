/** Built-in walkthroughs for the CRM / HRM / ERP demos (11) and the CAD / BIM demos 1-22. Steps only navigate and highlight; see guard.ts. */
import { P, cfg, ck, ckAllow, go, tab, smp, wt, type Raw } from "./dsl";
import type { WtConfig } from "./schema";

const NOTE: Raw = ["Where the data lives", "All data is fictional. Changes are kept in this browser, and nothing is sent to anyone.", "tid:storage-note", [], P];
const nav = (label: string, why: string, target = `nav:${label}`): Raw => [label, why, target, [go(`nav:${label}`)]];


/** Suite demo 11-21: start screen, bundled samples, then the workspace (needs the server back-end, so opening the sample is allowed to create its own anonymous project). */
function suite(title: string, intro: string, completion: string, open: string, tabs: string[], _n: number, raw: Raw[]): WtConfig {
  void _n;
  return cfg(title, intro, completion, [
    ["What it does", intro, "h1"],
    ...raw,
    ["Open the sample", "One click opens the bundled sample. The server processes it and the results appear in the workspace.", open, [smp(open)], { ...P, durationMs: 6500 }],
    ["Results workspace", "The workspace lists the views and findings produced from the sample.", "text:Results", [wt("text:Results", 60000)]],
    ...tabs.map((t): Raw => [t, `The ${t} view of the processed sample.`, `tab:${t}`, [tab(`tab:${t}`)]]),
  ], { sandboxApi: true });
}

export const MORE: Record<string, WtConfig> = {
  /* ---------------- CRM / HRM / ERP ---------------- */
  "erp-crm-sales-pipeline": cfg("CRM & Sales Pipeline Management", "This is a sales command centre. The pipeline is the home screen, and every deal is one click from its history.", "That completes the CRM tour: pipeline, search, alerts, views and reports.", [
    ["The pipeline board", "Seven stages from New Lead to Lost, with deals as cards showing company, value, owner and close date.", "tid:kanban"],
    ["Stage totals", "Each column shows how many deals and how much value it holds, so the forecast is visible at a glance.", "tid:total-Proposal"],
    ["Global search", "Search finds deals, contacts and companies from anywhere in the app.", "tid:global-search"],
    ["Alerts", "Overdue follow-ups and stalled deals are raised as alerts.", "tid:bell"],
    ["List view", "Switch from the board to a sortable list of the same deals.", "btn:List", [ck("btn:List")]],
    ["Back to the board", "The board and the list always show the same data.", "btn:Board", [ck("btn:Board")]],
    nav("Leads", "Leads are qualified before they become opportunities."), nav("Contacts", "Contacts hold people and their history."), nav("Companies", "Companies group contacts and deals."),
    nav("Activities", "Calls, emails and meetings are logged against deals."), nav("Quotations", "Quotations are built from products and tied to a deal."), nav("Reports", "Reports summarise the pipeline and win rates."), NOTE,
  ]),
  "erp-erp-finance-accounting": cfg("ERP Finance, Accounting & Financial Reporting", "This is a finance workbook: invoices, bills, a double-entry ledger and statements, with the account balances always in view.", "That completes the finance tour: overview, ledger, invoices, expenses, accounts, reconciliation and reports.", [
    ["Overview", "Revenue, profit, receivables and cash for the selected period, compared with the one before.", "tid:ov-revenue"],
    ["Choose the period", "Every figure follows the period selector.", "tid:period"],
    nav("Transactions", "The general ledger lists each posting with debit, credit and status."), nav("Invoices", "Invoices show what is paid, due and overdue."), nav("Expenses", "Bills and expenses are categorised and approved."),
    nav("Accounts", "The chart of accounts shows balances by account."), nav("Reconciliation", "Bank lines are matched to postings here."), nav("Reports", "Profit and loss, balance sheet and cash flow are built from the ledger."), NOTE,
  ]),
  "erp-hrm-employee-management": cfg("HRM Employee Management & HR Operations", "This is a people-operations workspace: a faceted directory, full employee profiles, leave, onboarding and performance.", "That completes the HRM tour: directory, departments, onboarding, leave, performance and organisation.", [
    ["Employee directory", "Thirty fictional employees as cards, with department, status and type facets.", "tid:emp-cards"],
    ["Table view", "The same directory as a sortable table.", "btn:Table", [ck("btn:Table")]],
    ["Organisation tree", "Reporting lines drawn as a tree.", "btn:Org tree", [ck("btn:Org tree")]],
    ["Back to cards", "Switch back to the card view.", "btn:Cards", [ck("btn:Cards")]],
    ["Export", "The directory can be exported to CSV.", "tid:export-employees"],
    nav("Departments", "Departments have budgets and headcount."), nav("Onboarding", "Onboarding checklists track each new starter."), nav("Leave", "Leave requests, balances and a team calendar."), nav("Performance", "Review cycles and goals."), nav("Organization", "Workforce statistics and the org chart."), NOTE,
  ]),
  "erp-payroll-attendance-workforce": cfg("Payroll, Attendance & Workforce Management", "This is a workforce control room: who is scheduled, who has clocked in, and what needs attention before payroll.", "That completes the payroll tour: the day board, shifts, timesheets, payroll and exceptions.", [
    ["The day board", "A timeline per person shows the scheduled shift, the actual clock-in and out, late starts and overtime.", "tid:day-board"],
    ["Live counters", "Scheduled, present, late, absent, on leave, missing clock-outs and overtime hours.", "tid:stat-late"],
    nav("Shifts", "Shift patterns and the rota."), nav("Timesheets", "Timesheets are built from the clock data."), nav("Payroll", "Payslips are calculated from approved time."), nav("Exceptions", "Missing clock-outs and other problems are queued for correction."), nav("Reports", "Attendance and overtime reports."), NOTE,
  ]),
  "erp-inventory-warehouse-management": cfg("Inventory & Warehouse Management", "This is a warehouse workspace: stock by product and location, scanning, receiving, transfers and adjustments.", "That completes the inventory tour: stock, warehouses, scanning, valuation and movements.", [
    ["Stock table", "Every product with quantity on hand, location and status.", "tid:product-table"],
    ["Key figures", "Stock value, units, low-stock and out-of-stock counts.", "tid:kpi-value"],
    ["Filter by warehouse", "Show one warehouse or all of them.", "tid:wh-pick-w1", [ck("tid:wh-pick-w1"), ck("tid:wh-pick-all")]],
    ["Scan a barcode", "Type or scan a code to jump to a product.", "tid:scan-input"],
    nav("Low stock", "Items under their reorder point."), nav("Valuation", "Stock valued by method and category."), nav("Receipts", "Goods received against orders."), nav("Transfers", "Moves between warehouses."), nav("Adjustments", "Counts and corrections."), nav("History", "Every movement, with who and when."), nav("Warehouse map", "A map of bins and locations."), NOTE,
  ]),
  "erp-procurement-purchase-orders": cfg("Procurement & Purchase Orders", "This is a procurement workspace: requisitions, approvals, orders and deliveries in one pipeline.", "That completes the procurement tour: pipeline, requisitions, orders, deliveries, approvals and suppliers.", [
    ["The pipeline", "Orders move from requisition through approval and ordering to receipt and completion.", "tid:stage-requisition"],
    nav("Requisitions", "Staff request what they need; approvers see it here."), nav("Purchase orders", "Approved requisitions become purchase orders."), nav("Deliveries", "Deliveries are received against orders, including partial receipts."), nav("Approvals", "Pending approvals wait for an approver."), nav("Suppliers", "Supplier records with performance."), nav("Reports", "Spend and delivery reports."), NOTE,
  ]),
  "erp-helpdesk-service-management": cfg("Helpdesk & Service Management", "This is a helpdesk console: queues, a conversation per ticket, SLA clocks and analytics.", "That completes the helpdesk tour: queues, tickets, priority, agents, customers, SLA and analytics.", [
    ["Ticket queues", "Mine, all open, overdue, waiting and resolved.", "tid:queue-open"],
    ["Overdue tickets", "Overdue tickets are one click away.", "tid:queue-overdue", [ck("tid:queue-overdue")]],
    ["The ticket list", "Each ticket shows priority, status, assignee and SLA.", "tid:ticket-list"],
    nav("Priority board", "A board grouped by priority."), nav("Agents", "Agent workload."), nav("Customers", "Customer records and history."), nav("SLA", "Targets and breaches."), nav("Analytics", "Volume, response and resolution times."), nav("History", "Everything that happened to tickets."), NOTE,
  ]),
  "erp-marketing-automation-crm": cfg("Marketing Automation & CRM Campaigns", "This is a campaign studio: plan campaigns, build audiences and templates, and automate journeys.", "That completes the marketing tour: campaigns, audience, templates, journeys and analytics.", [
    ["Campaigns", "Campaign cards show status, audience and results.", "tid:campaign-cards"],
    nav("Audience", "Contacts and segments."), nav("Templates", "Reusable emails."), nav("Journeys", "Automated flows that react to what contacts do."), nav("Analytics", "Simulated campaign results. No email is ever sent."), NOTE,
  ]),
  "erp-project-resource-management": cfg("Project & Resource Management", "This is a project workspace: boards, timelines, calendars and team workload.", "That completes the project tour: board, scopes, timeline, calendar, list, team and reports.", [
    ["The board", "Tasks as cards across columns from backlog to done.", "tid:kanban"],
    ["Project scope", "Narrow the board to a single project or show all.", "tid:scope-pr1", [ck("tid:scope-pr1"), ck("tid:scope-all")]],
    ["Project progress", "Each project shows its progress against its tasks.", "tid:board-progress"],
    nav("Timeline", "Tasks on a time axis."), nav("Calendar", "Due dates by day."), nav("List", "All tasks as a sortable list."), nav("Team", "Who is working on what."), nav("Reports", "Progress and workload reports."), NOTE,
  ]),
  "erp-executive-analytics-automation": cfg("Executive Analytics & Business Automation", "This is an executive briefing: key figures from commercial, finance, operations and people in one place.", "That completes the executive analytics tour: the briefing, each business area, alerts and data import.", [
    ["The briefing", "A written summary of what changed and what needs attention.", "tid:exec-summary"],
    ["Key figures", "Revenue, profit, cash and pipeline with change against the previous period.", "tid:kpi-revenue"],
    ["Choose the period", "Every figure follows the period.", "tid:period"],
    nav("Commercial", "Pipeline and sales performance."), nav("Finance", "Revenue, cost and cash."), nav("Operations", "Inventory, orders and delivery."), nav("People & service", "Headcount and helpdesk."), nav("Workflow & alerts", "Rules that raise alerts when thresholds are crossed."),
    nav("Import & explore", "Bring in a spreadsheet and explore it without leaving the browser."), NOTE,
  ]),
  "erp-workflow-automation-engine": cfg("Workflow Automation Engine", "This is a no-code workflow builder with an execution log, approvals and alerts. Workflows run in the browser on demo data.", "That completes the workflow tour: workflows, the execution log, approvals and alerts.", [
    ["Workflows", "Each workflow is a trigger, conditions and actions that you can switch on and off.", "tab:Workflows", [tab("tab:Workflows")]],
    ["Add example workflows", "One button adds ready-made examples to start from. (The tour does not press it, so your data is unchanged.)", "tid:add-examples"],
    ["Execution log", "Every run is logged with its inputs, the steps taken and the outcome.", "tab:Execution log", [tab("tab:Execution log")]],
    ["Approvals", "Steps that need a person wait here.", "tab:Approvals", [tab("tab:Approvals")]],
    ["Alerts", "Alerts raised by workflows are listed here.", "tab:Alerts", [tab("tab:Alerts")]], NOTE,
  ]),

  /* ---------------- CAD / BIM demos 1-10 ---------------- */
  "cad-revit-bim-automation-dashboard": cfg("Revit BIM Automation Dashboard", "This is a simulated Revit automation workspace on a sample office building. It illustrates what a plug-in could do; it is not connected to Revit.", "That completes the Revit automation tour across its seven sections.", [
    ["Project overview", "Model health, element counts and open issues for the sample building.", "btn:Project Overview", [go("btn:Project Overview")]],
    ["Model explorer", "Orbit, zoom and select elements in 3D and read their properties.", "btn:BIM Model Explorer", [go("btn:BIM Model Explorer")]],
    ["Elements and categories", "Counts by category with filters.", "btn:Elements & Categories", [go("btn:Elements & Categories")]],
    ["Automation tools", "Scripted batch operations a plug-in would run.", "btn:Automation Tools", [go("btn:Automation Tools")]],
    ["Model validation", "Parameter and naming checks with findings.", "btn:Model Validation", [go("btn:Model Validation")]],
    ["Quantities and schedules", "Schedules calculated from the model.", "btn:Quantities & Schedules", [go("btn:Quantities & Schedules")]],
    ["Reports and export", "Reports can be exported.", "btn:Reports & Export", [go("btn:Reports & Export")]],
  ]),
  "cad-autocad-drawing-automation-studio": cfg("AutoCAD Drawing Automation Studio", "This simulates a drawing automation tool on a sample drawing. It is not connected to AutoCAD.", "That completes the drawing automation tour.", [
    ["The drawing", "A sample plan you can pan and zoom, with each layer listed.", "btn:Fit drawing", [ck("btn:Fit drawing")]],
    ["Layers", "Switch layers on and off and see what is on each.", "btn:Layers", [go("btn:Layers")]],
    ["Hide and show all", "One click hides every layer so you can build the view up again.", "btn:Hide all", [ck("btn:Hide all"), ck("btn:Show all")]],
    ["Automation checks", "Rules a script would apply to every drawing: layers, dimensions and title blocks.", "btn:Automation checks", [go("btn:Automation checks")]],
    ["Pan and select tools", "Switch between selecting objects and panning the view.", "btn:Pan", [ck("btn:Pan"), ck("btn:Select")]],
  ]),
  "cad-sketchup-parametric-model-configurator": cfg("SketchUp Parametric Model Configurator", "This is a parametric house configurator. It illustrates how a SketchUp extension could drive a model from a few choices.", "That completes the configurator tour.", [
    ["Start from a preset", "Four building presets set sensible values for everything else.", "btn:Modern Residential", [ck("btn:Compact Commercial")]],
    ["Change the roof", "Roof type changes the 3D model immediately.", "btn:gable", [ck("btn:hip"), ck("btn:gable")]],
    ["Doors, windows and materials", "Each choice is a parameter with a clear effect on the model and the quantities.", "#dr"],
    ["Reset the camera", "Orbit freely, then return to the default view.", "btn:Reset camera", [ck("btn:Reset camera")]],
  ]),
  "cad-sketchup-dynamic-components-builder": cfg("SketchUp Dynamic Components Builder", "This illustrates building a dynamic component: a window whose size, glazing and material follow parameters.", "That completes the dynamic components tour.", [
    ["Parameters", "Opening, glazing and material are parameters; the model updates as they change.", "btn:Parameters", [go("btn:Parameters")]],
    ["Presets", "Standard, compact and premium presets set several parameters at once.", "btn:Premium", [ck("btn:Premium"), ck("btn:Standard")]],
    ["Component library", "Saved components can be reused.", "btn:Component library", [go("btn:Component library")]],
    ["Display modes", "Shaded, wireframe and dimension views.", "btn:Wireframe", [ck("btn:Wireframe"), ck("btn:Shaded")]],
  ]),
  "cad-bricscad-automation-workbench": cfg("BricsCAD Automation Workbench", "This simulates an automation workbench over a set of sample drawings. It is not connected to BricsCAD.", "That completes the BricsCAD workbench tour.", [
    ["Drawing set", "Five sample drawings: plans, an elevation, a section and a site layout.", "btn:Ground Floor Plan", [ck("btn:First Floor Plan"), ck("btn:Ground Floor Plan")]],
    ["Layers on and off", "Switch every layer off, then back on.", "btn:All off", [ck("btn:All off"), ck("btn:All on")]],
    ["Fit to view", "Zoom the drawing to fit.", "btn:Fit to view", [ck("btn:Fit to view")]],
  ]),
  "cad-bim-model-data-explorer": cfg("BIM Model Data Explorer", "This explores the data behind a sample BIM model: elements, parameters and warnings.", "That completes the BIM data explorer tour.", [
    ["Filters", "Filter by category, level and status.", "#bc"],
    ["Element list", "Each element shows its identifier, type and any warning.", "btn:EL-1016", [ck("btn:EL-1016")]],
    ["Level and category", "Narrow the list to a level or category.", "#bl"],
  ]),
  "cad-cad-batch-processing-manager": cfg("CAD Batch Processing Manager", "This simulates a queue of CAD jobs: choose units, a job type and a schedule.", "That completes the batch manager tour.", [
    ["Units", "Choose the units for the batch.", "#un"],
    ["Job type", "Choose what the batch should do to each drawing.", "#jc"],
    ["Schedule", "Choose when it runs.", "#js"],
    ["Sample DXF", "A sample drawing can be downloaded to try the demo with. (The tour does not download it.)", "btn:Download a sample DXF to try", [], P],
  ]),
  "cad-engineering-calculation-workbench": cfg("Engineering Calculation Workbench", "This is a calculation workbench with documented formulas. The results are illustrative, not engineering design.", "That completes the calculation workbench tour.", [
    ["Beam analysis", "A beam with a chosen load case and material.", "btn:Beam analysis", [go("btn:Beam analysis")]],
    ["Presets", "Choose a preset and see the inputs and results change.", "#preset"],
    ["Step-by-step", "Every calculation can be shown step by step.", "tab:Step-by-step", [tab("tab:Step-by-step")]],
    ["Formulas and assumptions", "The formulas and assumptions are stated, so results can be checked.", "tab:Formulas and assumptions", [tab("tab:Formulas and assumptions")]],
    ["Section properties", "Second moment of area and section modulus.", "btn:Section properties", [go("btn:Section properties")]],
    ["Material quantities", "Quantities from dimensions.", "btn:Material quantities", [go("btn:Material quantities")]],
    ["Unit conversion", "Convert between unit systems.", "btn:Unit conversion", [go("btn:Unit conversion")]],
    ["Load summary", "A simplified load summary.", "btn:Simplified load summary", [go("btn:Simplified load summary")]],
  ]),
  "cad-bim-quantity-takeoff-cost-estimator": cfg("BIM Quantity Takeoff & Cost Estimator", "This takes quantities from a sample 3D building and prices them with placeholder rates.", "That completes the quantity takeoff tour.", [
    ["The model", "A sample building in 3D; quantities come from its elements.", "btn:Iso", [ck("btn:Top"), ck("btn:Iso")]],
    ["Display", "Shaded or X-ray view.", "btn:X-ray", [ck("btn:X-ray"), ck("btn:Shaded")]],
    ["Levels", "Look at one level at a time.", "btn:Level 2", [ck("btn:Level 2"), ck("btn:Level 1")]],
    ["Estimate settings", "Choose levels, materials and rates for the estimate.", "#tl"],
  ]),
  "cad-cad-to-bim-conversion-validation-studio": cfg("CAD-to-BIM Conversion & Validation Studio", "This simulates an eight-stage conversion from a CAD drawing to a BIM model, with validation.", "That completes the conversion studio tour.", [
    ["Eight stages", "From the source drawing through units, layers, geometry and mapping to BIM generation and validation.", "btn:Stage 1"],
    ["Run all stages", "Run the whole conversion on the sample drawing. It runs in the page.", "btn:Run all stages", [ck("btn:Run all stages")], { durationMs: 9000 }],
    ["Results and export", "The final stage lists what was created and any validation findings.", "btn:Stage 8", [go("btn:Stage 8")]],
  ]),

  /* ---------------- CAD / BIM suite 11-22 ---------------- */
  "suite-plan-to-3d-building-model": suite("2D Architectural Plan → Interactive 3D Building Model", "This turns a 2D plan into a 3D building model: walls, doors, windows, rooms, slabs, a roof and optional MEP, with every assumption recorded.", "That completes the plan-to-3D tour.", "btn:Open the sample house", ["3D model", "2D plan"], 4, [
    ["Upload or use a sample", "Upload a DXF, SVG, image or IFC plan, or open a bundled sample house.", "btn:Upload my own plan"],
    ["Bundled samples", "Samples are synthetic and labelled; they exist so the demo works without any file.", "btn:Open sample"],
  ]),
  "suite-cad-drawing-analysis-conversion": suite("CAD Drawing Analysis & Conversion", "This inspects a CAD drawing: layers, entities, blocks, text and units, geometry problems, and conversion to other formats with a round-trip check.", "That completes the drawing analysis tour.", "tid:start-sample", ["2D drawing", "Analysis"], 4, [["Bundled drawings", "A tidy house plan, a drawing with deliberate defects and an SVG are bundled.", "tid:sample-cad-dirty"]]),
  "suite-bim-model-viewer": suite("BIM Model Viewer & Information Explorer", "This opens an IFC model and shows what it really contains: the spatial tree, classes, property sets and quantities.", "That completes the BIM viewer tour.", "tid:start-sample", ["3D model", "Analysis"], 4, [["Bundled models", "A one-storey and a two-storey house are bundled as IFC.", "tid:sample-viewer-house-2st"]]),
  "suite-point-cloud-scan-to-bim": suite("Point Cloud & Scan-to-BIM Analysis", "This cleans a point cloud, fits planes and measures, and drafts a model from a scanned room.", "That completes the point cloud tour.", "tid:start-sample", ["Point cloud", "3D view", "Analysis"], 4, [["Bundled scans", "A synthetic room scan is bundled in LAS and PLY, including a rotated version.", "tid:sample-cloud-room-rot"]]),
  "suite-cad-to-bim-interoperability": suite("CAD-to-BIM & Model Interoperability", "This converts between CAD and BIM formats and re-reads every output to check it against the source.", "That completes the interoperability tour.", "tid:start-sample", ["Analysis", "3D model"], 4, [["Bundled sources", "A DXF house plan and an IFC are bundled as conversion sources.", "tid:sample-interop-ifc"]]),
  "suite-floor-plan-analysis": suite("Architectural Design & Floor Plan Analysis", "This reads rooms, walls and openings from a floor plan and builds schedules you can check.", "That completes the floor plan tour.", "tid:start-sample", ["2D plan", "Analysis", "3D model"], 4, [["Bundled plans", "A DXF, an SVG and a raster plan are bundled so the three input types can be compared.", "tid:sample-fp-raster"]]),
  "suite-structural-drawing-analysis": suite("Structural Engineering & Drawing Analysis", "This reads grids, columns, beams and footings from a structural drawing and compares two revisions. It does not design or check any structure.", "That completes the structural drawing tour.", "tid:start-sample", ["2D drawing", "3D view", "Analysis"], 4, [["Revision comparison", "Two revisions of the same framing plan are bundled so differences can be listed.", "tid:sample-struct-ab"]]),
  "suite-mep-hvac-coordination": suite("MEP & HVAC Design, Visualization & Coordination", "This builds MEP systems from a drawing, finds dead ends and unconnected equipment, and detects clashes between disciplines.", "That completes the MEP coordination tour.", "tid:start-sample", ["3D model", "Analysis"], 4, [["Bundled house with MEP", "A sample house with ducts, pipes and conduits at known heights is bundled.", "tid:sample-mep-house"]]),
  "suite-bim-quality-control": suite("BIM Validation & Quality Control", "This checks an IFC model against configurable rules and lists findings. These are data checks, not building-code checks.", "That completes the BIM quality control tour.", "tid:start-sample", ["Analysis", "3D model"], 4, [["Clean and flawed models", "One clean model and one with injected defects are bundled, so you can see the rules find exactly what was planted.", "tid:sample-qc-flawed"]]),
  "suite-quantity-takeoff-cost-estimate": suite("Construction Quantity Takeoff & Cost Estimation", "This measures quantities from a plan or an IFC and prices them with rates you can change. Rates are placeholders, not market prices.", "That completes the quantity takeoff tour.", "tid:start-sample", ["Analysis", "3D model"], 4, [["Bundled sources", "A sample house plan and an IFC with stored quantities are bundled.", "tid:sample-qto-ifc"]]),
  "suite-bim-project-review-issues": suite("BIM Collaboration, Issue Tracking & Model Review", "This holds model revisions, compares them, and tracks issues and comments with a history. It records people's decisions; it does not judge the model.", "That completes the collaboration tour.", "tid:start-sample", [], 3, [
    ["Start a project", "Open a sample review with two revisions and three issues, or start an empty project.", "tid:start-blank"],
  ]),
  "suite-architectural-geometry-simplification": cfg("Architectural Geometry Intelligence", "This is a proof of concept for preparing building geometry for a physics engine: extract what matters, reduce it to zero-thickness surfaces, and reprocess only what changes. The building is a generated sample; nothing is read from Revit or SketchUp.", "That completes the geometry simplification tour.", [
    ["Import the sample model", "A three-storey commercial building is generated in the browser, standing in for a Revit or SketchUp import.", "tid:import-overlay", [ckAllow("tid:import-overlay")], { durationMs: 4500 }],
    ["The detailed original", "Layered walls, framed windows, partitions, a roof, overhangs, trees and neighbours: tens of thousands of triangles.", "tid:viewport"],
    ["Extract the elements", "Every element is classified by its source category, with a geometry rule for untyped objects.", "tid:nav-extraction", [go("tid:nav-extraction"), ck("tid:extract"), wt("tid:extract-summary", 30000)], { durationMs: 6000 }],
    ["Simplify the model", "Solids become single mid-plane surfaces with zero thickness; openings stay as sub-surfaces of their wall.", "tid:nav-simplification", [go("tid:nav-simplification"), ck("tid:simplify"), wt("tid:simp-result", 40000)], { durationMs: 7000 }],
    ["Original beside analytical", "The same view of both models, side by side.", "tid:compare-toggle", [ck("tid:compare-toggle")], { durationMs: 6000 }],
    ["Thermal zones", "Each room is a zone with its floor, ceiling and boundary surfaces, and an enclosure check.", "tid:nav-zones", [ck("tid:compare-toggle"), go("tid:nav-zones"), ck("tid:zone-Z-L2-A")], { durationMs: 6000 }],
    ["Shading geometry", "Trees, neighbours and overhangs keep their position and facing but lose their detail.", "tid:nav-shading", [go("tid:nav-shading")]],
    ["An architect changes a window", "Window WIN-L2-S03 is widened. Only the cached results that depend on it become outdated.", "tid:nav-incremental", [go("tid:nav-incremental"), ck("tid:modify")], { durationMs: 6000 }],
    ["Reprocess only what changed", "Three of the cached elements are reprocessed; the rest are reused.", "tid:update-incremental", [ck("tid:update-incremental"), wt("tid:incr-summary", 20000)], { durationMs: 7000 }],
    ["Performance", "Counts, reduction and timings measured live in this browser.", "tid:nav-performance", [go("tid:nav-performance")]],
    ["Export", "The analytical model downloads as JSON, ready to hand to an analysis engine.", "tid:nav-export", [go("tid:nav-export")]],
  ]),
};

/** Steps beyond this index need the suite's server back-end, which is not available where the walkthroughs are checked; the start screen up to it is verified. */
export const PARTIAL: Record<string, number> = Object.fromEntries(Object.keys(MORE).filter((k) => k.startsWith("suite-") && !k.endsWith("geometry-simplification")).map((k) => [k, MORE[k].steps.findIndex((s) => s.title === "Open the sample") + 1]));
