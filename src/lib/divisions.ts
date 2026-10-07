/**
 * The three technology pillars. These are structural (they drive routes and navigation)
 * so they live in code; everything beneath them (sub-categories, projects, copy) is CMS data.
 */
export type DivisionSlug = "computer-vision" | "crm-hrm-erp" | "cad-bim";

export interface CapabilityGroup {
  title: string;
  items: string[];
}

export interface Division {
  slug: DivisionSlug;
  /** Short label for nav + chips */
  short: string;
  name: string;
  navLabel: string;
  code: string;
  tagline: string;
  intro: string;
  /** Default pipeline shown on case-study pages of this division */
  pipeline: string[];
  groups: CapabilityGroup[];
  /** "Relevant technologies" – presented as capabilities, not a guarantee for every project */
  technologies?: CapabilityGroup[];
  metaDescription: string;
}

export const DIVISIONS: Division[] = [
  {
    slug: "computer-vision",
    short: "Computer Vision / AI",
    name: "Computer Vision / ML / DL",
    navLabel: "Computer Vision / AI",
    code: "01",
    tagline: "Systems that understand images, video and complex data.",
    intro:
      "Neo Forge Technology develops intelligent systems capable of understanding images, video and complex data — from the first labelled dataset to a model running reliably on a production camera or edge device.",
    pipeline: ["Video", "AI Model", "Detection", "Analytics"],
    metaDescription:
      "Custom computer vision, machine learning, deep learning and edge AI development: object detection, tracking, OCR, video analytics and visual inspection.",
    groups: [
      {
        title: "Computer Vision",
        items: [
          "Object Detection", "Object Tracking", "Image Recognition", "Video Analytics", "OCR",
          "Image Processing", "Video Processing", "Segmentation", "Pose Estimation",
          "Visual Inspection", "Face Detection", "Feature Extraction",
        ],
      },
      {
        title: "Machine Learning",
        items: ["Classification", "Regression", "Predictive Models", "Anomaly Detection", "Recommendation Systems", "Custom ML Pipelines"],
      },
      {
        title: "Deep Learning",
        items: ["Neural Networks", "CNNs", "Transformers", "Vision Models", "Custom Model Training", "Model Optimization", "Model Deployment"],
      },
      {
        title: "AI",
        items: ["AI Applications", "AI APIs", "AI Agents", "Intelligent Automation", "Generative AI Integrations", "AI-powered Analytics"],
      },
      {
        title: "Edge AI",
        items: ["On-device inference", "Real-time video pipelines", "GPU acceleration", "Model quantization", "Embedded deployment"],
      },
    ],
    technologies: [
      {
        title: "Relevant technologies",
        items: ["NVIDIA Jetson", "TensorRT", "DeepStream", "CUDA", "OpenCV", "PyTorch", "TensorFlow", "ONNX", "MediaPipe", "YOLO"],
      },
    ],
  },
  {
    slug: "crm-hrm-erp",
    short: "CRM / HRM / ERP",
    name: "CRM / HRM / ERP & AI Automation",
    navLabel: "CRM / HRM / ERP",
    code: "02",
    tagline: "Business platforms and automation built around your real workflow.",
    intro:
      "We design and build the software a business runs on — customer, people and operations platforms — and add AI automation where it removes real manual work.",
    pipeline: ["Lead", "Workflow", "Automation", "Dashboard"],
    metaDescription:
      "Custom CRM, HRM and ERP software with AI automation: workflow automation, AI agents, document processing and business process automation.",
    groups: [
      {
        title: "CRM",
        items: [
          "Sales CRM", "Lead Management", "Customer Management", "Pipeline Management", "Sales Automation",
          "Customer Support", "Marketing Automation", "Customer Retention", "CRM Analytics", "AI-powered CRM",
        ],
      },
      {
        title: "HRM",
        items: [
          "Employee Management", "Recruitment", "Applicant Tracking", "Payroll", "Attendance",
          "Employee Self-Service", "Performance Management", "Training & Development", "Employee Benefits", "HR Automation",
        ],
      },
      {
        title: "ERP",
        items: [
          "Finance", "Accounting", "Procurement", "Inventory", "Warehouse", "Supply Chain",
          "Manufacturing", "Project Management", "Business Operations", "ERP Reporting",
        ],
      },
      {
        title: "AI Automation",
        items: [
          "Workflow Automation", "AI Agents", "Document Processing", "Email Automation", "Lead Automation",
          "Customer Support Automation", "Business Process Automation", "Data Extraction", "AI Reporting", "Intelligent Workflows",
        ],
      },
    ],
  },
  {
    slug: "cad-bim",
    short: "CAD / BIM",
    name: "CAD / BIM & Engineering Software",
    navLabel: "CAD / BIM",
    code: "03",
    tagline: "Plugins, automation and engineering tools inside the CAD software your team already uses.",
    intro:
      "Our focus is software development and automation for CAD and BIM platforms — not design services. We build plugins, extensions and engineering applications that remove repetitive modelling and documentation work.",
    pipeline: ["CAD Software", "Plugin", "Automation", "Output"],
    metaDescription:
      "Revit, AutoCAD, SketchUp and BricsCAD plugin development, BIM automation, dynamic components and custom engineering software.",
    groups: [
      {
        title: "Revit",
        items: [
          "Revit Plugin Development", "Revit API", "BIM Automation", "Family Automation", "Parameter Automation",
          "Model Automation", "Data Extraction", "Workflow Automation", "Custom Revit Tools",
        ],
      },
      {
        title: "AutoCAD",
        items: [
          "AutoCAD Plugin Development", "AutoCAD API", "AutoLISP", ".NET Development", "CAD Automation",
          "Custom Commands", "Drawing Automation", "Data Extraction", "Batch Processing",
        ],
      },
      {
        title: "SketchUp",
        items: [
          "SketchUp Extensions", "SketchUp Ruby API", "SketchUp Automation", "Dynamic Components",
          "Parametric Components", "Custom Tools", "Model Automation",
        ],
      },
      {
        title: "BricsCAD",
        items: ["BricsCAD Plugin Development", "BricsCAD Automation", "Custom Commands", "API Development", "CAD Workflow Automation"],
      },
      {
        title: "BIM",
        items: [
          "BIM Automation", "BIM Data Processing", "Model Data Extraction", "IFC",
          "Model Coordination", "Parametric Modeling", "BIM Workflow Automation",
        ],
      },
      {
        title: "Engineering Software",
        items: [
          "Engineering Calculators", "Design Automation", "Parametric Design Tools",
          "Configuration Software", "Technical Software", "Custom Engineering Applications",
        ],
      },
    ],
  },
];

export const DIVISION_MAP: Record<string, Division> = Object.fromEntries(DIVISIONS.map((d) => [d.slug, d]));
export const isDivisionSlug = (s: string): s is DivisionSlug => s in DIVISION_MAP;

/** Technology groups for the /technology page. Presented as relevant technologies, not a claim every project uses all. */
export const TECH_GROUPS: CapabilityGroup[] = [
  { title: "AI / CV", items: ["Python", "C++", "OpenCV", "PyTorch", "TensorFlow", "YOLO", "ONNX", "TensorRT", "CUDA", "DeepStream", "MediaPipe"] },
  { title: "Software", items: ["Next.js", "TypeScript", "Node.js", "Python", "FastAPI", "PostgreSQL", "Firebase", "Docker", "REST APIs"] },
  { title: "CAD / BIM", items: ["Revit API", "AutoCAD API", "AutoLISP", ".NET", "SketchUp Ruby API", "SketchUp Dynamic Components", "BricsCAD API", "IFC"] },
];

export const PROJECT_TYPES = [
  "Computer Vision", "Machine Learning", "Deep Learning", "AI", "CRM", "HRM", "ERP", "AI Automation",
  "Revit", "AutoCAD", "SketchUp", "BricsCAD", "BIM", "CAD Automation", "Custom Software", "Other",
] as const;

/** Default sub-categories seeded by the idempotent migration. Admin can add / edit / remove afterwards. */
export const DEFAULT_CATEGORIES: Record<DivisionSlug, string[]> = {
  "computer-vision": ["Computer Vision", "Object Detection", "Tracking", "Video Analytics", "OCR", "AI Inspection", "Edge AI", "Machine Learning", "Deep Learning"],
  "crm-hrm-erp": ["CRM", "HRM", "ERP", "AI Automation", "Workflow Automation", "AI Agents", "Business Intelligence"],
  "cad-bim": ["Revit", "AutoCAD", "SketchUp", "SketchUp Dynamic Components", "BricsCAD", "BIM", "CAD Automation", "Engineering Software"],
};

export const WHY_US = [
  { title: "Technical Depth", body: "We work with complex software, AI and engineering workflows." },
  { title: "Custom Development", body: "Solutions are designed around the client's actual workflow." },
  { title: "Cross-Domain Expertise", body: "AI, enterprise software and engineering technology under one team." },
  { title: "Scalable Architecture", body: "Systems built to evolve as requirements grow." },
  { title: "Production Focus", body: "Deployable, usable software rather than demonstrations alone." },
];
