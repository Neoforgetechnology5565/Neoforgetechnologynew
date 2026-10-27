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
    features: ["Click elements in a plan of a sample building and inspect them", "Edit parameters such as mark, type, material and fire rating", "Filter by category, level, search text or validation warnings", "Run automation rules: number marks, set fire ratings, validate the model", "Generate a grouped quantity schedule and download it as CSV", "Activity log of every change, and a reset to the original data"] },
  { slug: "autocad-drawing-automation-studio", no: "02", phase: 1, status: "live", title: "AutoCAD Drawing Automation Studio",
    problem: "Drafters repeat the same layer, dimension and title-block steps on every drawing.",
    tags: ["AutoCAD API", "AutoLISP", ".NET"],
    features: ["Edit drawing properties and title-block data", "Manage layers and layer standards", "Configure dimension styles", "Preview generated technical drawings"] },
  { slug: "sketchup-parametric-model-configurator", no: "03", phase: 1, status: "live", title: "SketchUp Parametric Model Configurator",
    problem: "Producing model variants by remodelling each one is slow.",
    tags: ["SketchUp Ruby API", "Parametric"],
    features: ["Change dimensions, materials and component options", "Live-updating model preview", "Save and compare configurations"] },
  { slug: "bricscad-automation-workbench", no: "05", phase: 1, status: "soon", title: "BricsCAD Automation Workbench",
    problem: "Teams moving to BricsCAD need their repetitive drawing operations automated.",
    tags: ["BricsCAD API", ".NET", "CAD Automation"],
    features: ["Explore layers and inspect drawing entities", "Configure automation commands", "Preview automated CAD operations"] },
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
  { slug: "sketchup-dynamic-components-builder", no: "04", phase: 3, status: "soon", title: "SketchUp Dynamic Components Builder",
    problem: "Configurable components are difficult to set up and test.",
    tags: ["SketchUp Dynamic Components"],
    features: ["Adjust width, height and depth", "Switch component configurations", "Immediate visual feedback"] },
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
