/** CAD/BIM interactive demo catalogue. Demos run in the browser on clearly labelled sample data. */
export interface Demo {
  slug: string;
  no: string;
  title: string;
  /** The engineering problem the demo illustrates */
  problem: string;
  tags: string[];
  features: string[];
  phase: 1 | 2 | 3;
  /** "live" demos have a working interface; "soon" ones are planned and shown as such */
  status: "live" | "soon";
}

export const DEMO_DISCLAIMER =
  "Interactive demonstration using sample data. Features illustrate possible software capabilities and do not necessarily represent a completed client deployment.";

export const DEMOS: Demo[] = [
  { slug: "revit-bim-automation-dashboard", no: "01", phase: 1, status: "live", title: "Revit BIM Automation Dashboard",
    problem: "Checking and updating hundreds of model elements by hand is slow and error-prone.",
    tags: ["Revit API", "C# / .NET", "BIM"],
    features: ["Orbit, zoom and pan a 3D sample office building; switch views, shaded / X-ray / wireframe, and isolate levels", "Select elements in 3D and inspect type, mark, fire rating, assembly code, dimensions and validation status", "Run a parameter audit, naming-convention check and model consistency review that list the exact affected elements", "Apply suggested fixes one by one or all at once, and see the model update", "Generate quantity schedules and download reports and findings", "Reset the demo to its original data"] },
  { slug: "autocad-drawing-automation-studio", no: "02", phase: 1, status: "live", title: "AutoCAD Drawing Automation Studio",
    problem: "Drafters repeat the same layer, dimension and title-block steps on every drawing.",
    tags: ["AutoCAD API", "AutoLISP", ".NET"],
    features: ["Zoom, pan and select objects on a detailed sample floor plan (walls, doors, windows, rooms, dimensions, furniture)", "Toggle layers, dimensions and annotations; search for objects", "Run layer-naming, unexpected-layer, duplicate, missing-dimension, room-label and geometry checks with highlighted results", "Locate and fix findings, then export a report"] },
  { slug: "sketchup-parametric-model-configurator", no: "03", phase: 1, status: "live", title: "SketchUp Parametric Model Configurator",
    problem: "Producing model variants by remodelling each one is slow.",
    tags: ["SketchUp Ruby API", "Parametric"],
    features: ["Change width, length, floors, floor height, roof type and pitch, windows, door, materials and colours", "A realistic 3D house updates live with orbit, zoom and pan", "Add balcony, porch canopy, chimney and solar panels", "Four presets, a live quantity and illustrative cost summary, and export to TXT, JSON or OBJ"] },
  { slug: "bricscad-automation-workbench", no: "05", phase: 1, status: "live", title: "BricsCAD Automation Workbench",
    problem: "Teams moving to BricsCAD need their repetitive drawing operations automated.",
    tags: ["BricsCAD API", ".NET", "CAD Automation"],
    features: ["Five-drawing sample set: plans, elevation, section and site layout", "Layer manager with visibility, line types and non-standard layer flags", "Ten automation actions: naming audit, duplicates, dimensions, annotations, classification, geometry, summary, cleanup, layer organisation and standards scorecard", "Before / after comparison with a differences view, activity history and report export"] },
  { slug: "bim-model-data-explorer", no: "06", phase: 2, status: "soon", title: "BIM Model Data Explorer",
    problem: "Model data is hard to browse and check without the authoring software.",
    tags: ["BIM", "IFC"],
    features: ["Browse a sample building model tree", "Inspect element properties", "Filter by category", "Explore relationships between elements"] },
  { slug: "cad-batch-processing-manager", no: "07", phase: 2, status: "soon", title: "CAD Batch Processing Manager",
    problem: "Applying the same change to hundreds of drawings by hand wastes days.",
    tags: ["CAD Automation", "Python"],
    features: ["Add sample drawings to a batch", "Configure batch operations", "Watch processing status", "Review output summaries"] },
  { slug: "engineering-calculation-workbench", no: "08", phase: 2, status: "soon", title: "Engineering Calculation Workbench",
    problem: "Engineering spreadsheets are fragile, unchecked and hard to compare across scenarios.",
    tags: ["Engineering Software", "Python"],
    features: ["Change engineering inputs", "Run sample calculations", "Compare scenarios side by side", "Export a results report"] },
  { slug: "sketchup-dynamic-components-builder", no: "04", phase: 3, status: "live", title: "SketchUp Dynamic Components Builder",
    problem: "Configurable components are difficult to set up and test.",
    tags: ["SketchUp Dynamic Components"],
    features: ["Component library: window system, hinged door, shelving unit, staircase and façade panel", "Edit dimensions, counts, materials, colours and options; the 3D model rebuilds live with measured dimensions", "Built-in configuration rules warn about invalid combinations", "Presets, calculated quantities, part inspection and JSON / TXT export"] },
  { slug: "bim-quantity-takeoff-cost-estimator", no: "09", phase: 3, status: "soon", title: "BIM Quantity Takeoff & Cost Estimator",
    problem: "Estimators retype quantities from models into cost spreadsheets.",
    tags: ["BIM Data", "Quantity Takeoff"],
    features: ["Select building components", "Calculate sample quantities", "Adjust unit costs", "Generate an estimate"] },
  { slug: "cad-to-bim-conversion-validation-studio", no: "10", phase: 3, status: "soon", title: "CAD-to-BIM Conversion & Validation Studio",
    problem: "Turning legacy CAD drawings into BIM objects needs mapping and checking.",
    tags: ["CAD/BIM Interoperability"],
    features: ["Explore sample CAD geometry", "Map elements to BIM categories", "Review validation warnings", "Inspect a proposed conversion"] },
];
DEMOS.sort((a, b) => a.no.localeCompare(b.no));

export const DEMO_MAP = Object.fromEntries(DEMOS.map((d) => [d.slug, d])) as Record<string, Demo>;
