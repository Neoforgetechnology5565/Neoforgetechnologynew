import type { DivisionSlug } from "./divisions";

/** Search-focused landing pages, one per service buyers look for. Text is general and does not claim specific results or clients. */
export interface ServicePage {
  slug: string;
  division: DivisionSlug;
  /** Short name used in links and lists */
  name: string;
  h1: string;
  /** Used as <title> (the site name is appended) */
  metaTitle: string;
  metaDescription: string;
  intro: string;
  build: string[];
  fit: string[];
  tech: string[];
  faqs: { q: string; a: string }[];
}

export const PROCESS: { title: string; text: string }[] = [
  { title: "Discovery", text: "You describe the workflow, the data and the systems involved. We ask the questions that decide scope and risk." },
  { title: "Scope and plan", text: "You get a written proposal: what will be built, how, the timeline and the price, before any commitment." },
  { title: "Build and review", text: "We build in short steps and show working software early, so you can steer before the end." },
  { title: "Deliver and support", text: "Deployment, documentation, handover and a period of support, so your team can rely on it." },
];

export const SERVICES: ServicePage[] = [
  {
    slug: "revit-plugin-development", division: "cad-bim", name: "Revit Plugin Development",
    h1: "Revit plugin development for BIM teams",
    metaTitle: "Revit Plugin Developer | Custom Revit API Tools",
    metaDescription: "Custom Revit plugins and add-ins built with the Revit API: automate sheets, parameters, families, schedules and model checks. Tell us what to automate.",
    intro: "We build custom Revit plugins that take repetitive modelling and documentation work off your team. If your engineers do the same clicks every week, it can usually be automated with the Revit API.",
    build: ["Parameter filling, renaming and data transfer across many elements", "Sheet, view and schedule creation from templates", "Model health checks and standards validation before every issue", "Import and export between Revit, Excel and other systems", "Custom ribbon tools, dialogs and batch commands for your office", "Family and type management helpers"],
    fit: ["Your team repeats the same Revit task daily or weekly", "You have company standards that are checked by hand", "Off-the-shelf add-ins almost fit, but not quite"],
    tech: ["Revit API", "C# / .NET", "Dynamo", "IFC", "Excel / CSV", "REST APIs"],
    faqs: [
      { q: "Which Revit versions do you support?", a: "We build for the Revit versions your team uses and tell you up front which releases a plugin will support. Plugins usually need a rebuild when a new Revit version comes out; we can include that in a support plan." },
      { q: "Can you automate an existing manual process we already have?", a: "Yes. Most plugins start from a process your team already follows. We map the steps, agree what should be automated and what should stay manual, then build it." },
      { q: "Do we own the plugin?", a: "Ownership and licensing are set out in the written agreement before work starts. Many clients want full ownership of tools made for them; we agree this at the proposal stage." },
      { q: "How long does a plugin take?", a: "A focused tool can take a few weeks; larger suites take longer. We give a realistic estimate in the proposal after the discovery call." },
    ],
  },
  {
    slug: "ifc-data-validation-tool", division: "cad-bim", name: "IFC Data Validation",
    h1: "IFC data validation and automated BIM model checks",
    metaTitle: "IFC Validation Tool | Automated BIM Model Checks",
    metaDescription: "Custom IFC validation and BIM model checking tools: check naming, parameters, classification and geometry rules automatically and get clear reports.",
    intro: "Models get issued with missing data, wrong classifications and inconsistent naming. We build IFC and BIM checking tools that test your rules automatically and give clear, shareable reports.",
    build: ["Rule sets for required properties, naming and classification", "Checks on IFC files and on native Revit models", "Clear pass/fail reports for the BIM manager and the design team", "Batch checks across many models or revisions", "Issue lists that link back to the offending elements", "Integration with your existing review or CDE workflow"],
    fit: ["You check models against a standard by hand", "You receive IFC models from partners that need to be verified", "Information requirements keep being missed at handover"],
    tech: ["IFC", "IfcOpenShell", "Python", "Revit API", "C# / .NET", "Reports in Excel, PDF or web"],
    faqs: [
      { q: "Can you check against our own BIM execution plan or standard?", a: "Yes. We turn the rules in your standard into automated checks, and agree with you how each rule should be tested." },
      { q: "Does it replace manual review?", a: "It removes the repetitive checking so engineers can focus on judgement. Anything the tool flags can be reviewed by a person before it changes a model." },
      { q: "Which IFC versions do you work with?", a: "We work with the IFC versions your projects use and confirm this in the proposal." },
      { q: "Can reports be shared with people who don't have Revit?", a: "Yes. Reports can be produced as spreadsheets, PDFs or a simple web view." },
    ],
  },
  {
    slug: "autocad-plugin-development", division: "cad-bim", name: "AutoCAD Plugin Development",
    h1: "AutoCAD plugin and AutoLISP development",
    metaTitle: "AutoCAD Plugin Developer | Custom Tools & AutoLISP",
    metaDescription: "Custom AutoCAD plugins, .NET tools and AutoLISP routines to automate drawings, batch processing, data extraction and standards checks.",
    intro: "We build AutoCAD tools that speed up drawing production and remove manual rework: batch processing, data extraction, title blocks, layer standards and custom commands.",
    build: ["Batch plotting, renaming and drawing updates", "Data extraction from drawings into Excel or databases", "Layer, block and title block standards checks", "Custom commands, palettes and dialogs", "Conversion of old AutoLISP routines to maintained .NET tools", "Drawing generation from data or parameters"],
    fit: ["Your drafters repeat the same steps on many drawings", "You depend on old AutoLISP scripts no one maintains", "Drawing data has to reach other systems"],
    tech: ["AutoCAD .NET API", "AutoLISP", "C#", "Excel / CSV", "SQL databases"],
    faqs: [
      { q: "Can you modernise our existing AutoLISP scripts?", a: "Yes. We review what the scripts do, keep what works and rebuild it in a form that is easier to maintain." },
      { q: "Does it work with AutoCAD LT?", a: "Some capabilities are limited in AutoCAD LT. We check this during discovery and recommend an approach that fits your licences." },
      { q: "Can it run on many drawings at once?", a: "Yes. Batch processing across folders of drawings is one of the most common requests." },
    ],
  },
  {
    slug: "sketchup-extension-development", division: "cad-bim", name: "SketchUp Extension Development",
    h1: "SketchUp extension and dynamic component development",
    metaTitle: "SketchUp Extension Developer | Ruby & Dynamic Components",
    metaDescription: "Custom SketchUp extensions in Ruby and parametric dynamic components that automate modelling, configuration and output.",
    intro: "We build SketchUp extensions and dynamic components for modelling automation, product configurators and custom tools your team uses every day.",
    build: ["Ruby extensions with toolbars and dialogs", "Parametric, configurable dynamic components", "Automated model generation from inputs or spreadsheets", "Bills of materials and report export", "Cleanup, naming and standards tools", "Packaging for installation by your team"],
    fit: ["You build the same kinds of models again and again", "You need a configurable product or component library", "You want data from models in a spreadsheet"],
    tech: ["SketchUp Ruby API", "Dynamic Components", "HTML dialogs", "Excel / CSV"],
    faqs: [
      { q: "Can you build a configurator for our products?", a: "Yes. Dynamic components and extensions can let a user change sizes and options and have the model and quantities update." },
      { q: "Will it work on Mac and Windows?", a: "We build extensions to work on both unless you only need one, and confirm this in the proposal." },
    ],
  },
  {
    slug: "bricscad-plugin-development", division: "cad-bim", name: "BricsCAD Plugin Development",
    h1: "BricsCAD plugin and custom command development",
    metaTitle: "BricsCAD Plugin Developer | Custom CAD Tools",
    metaDescription: "BricsCAD plugins, custom commands and CAD workflow automation built to your standards.",
    intro: "We build BricsCAD plugins and custom commands that automate drawing and modelling work, using the platform's APIs.",
    build: ["Custom commands and toolbars", "Batch processing of drawings", "Data extraction and reporting", "Standards and quality checks", "Porting existing AutoCAD tools to BricsCAD", "Integration with your other systems"],
    fit: ["You use BricsCAD and need tools that match your workflow", "You are moving from AutoCAD and need your tools ported"],
    tech: ["BricsCAD API", "C# / .NET", "LISP", "Excel / CSV"],
    faqs: [
      { q: "Can you port our AutoCAD tools to BricsCAD?", a: "Often yes. We review what the tools do and how much can be reused, then give you an estimate." },
      { q: "Do you provide support after delivery?", a: "Yes. Support and updates can be agreed as part of the proposal." },
    ],
  },
  {
    slug: "cad-automation-software", division: "cad-bim", name: "CAD Automation Software",
    h1: "CAD automation software for engineering teams",
    metaTitle: "CAD Automation Software | Engineering Tools",
    metaDescription: "Custom CAD automation, parametric design tools, calculators and configurators that turn engineering rules into software.",
    intro: "When engineering rules are repeated by hand, they can usually be turned into software: parametric design tools, calculators, configurators and automatic drawing output.",
    build: ["Parametric design tools driven by your rules", "Engineering calculators and checkers", "Product and design configurators", "Automatic drawing and report generation", "Links between CAD, spreadsheets and databases", "Web tools your team or clients can use"],
    fit: ["Your design process follows rules that could be coded", "You produce many variants of similar designs", "Calculations are held in spreadsheets that are hard to maintain"],
    tech: ["Python", "C# / .NET", "CAD and BIM APIs", "Next.js / web apps", "SQL databases"],
    faqs: [
      { q: "Can you work from our existing spreadsheets and rules?", a: "Yes. They are usually the starting point. We check the logic with you and build it into software that is faster and harder to break." },
      { q: "Can clients use the tool themselves?", a: "Yes, we can build it as a web tool with access control if that fits your business." },
    ],
  },
  {
    slug: "custom-crm-development", division: "crm-hrm-erp", name: "Custom CRM Development",
    h1: "Custom CRM development built around your sales process",
    metaTitle: "Custom CRM Development | Sales Pipeline Software",
    metaDescription: "Custom CRM systems for lead capture, pipeline management, follow-ups and reporting, built around how your team actually sells.",
    intro: "A custom CRM follows your sales process instead of forcing you into someone else's. We build lead capture, pipeline tracking, follow-ups and reporting that your team will actually use.",
    build: ["Lead and contact management with your own fields", "Visual sales pipeline with stages that match your process", "Automatic reminders and follow-up tasks", "Email and website form integration", "Dashboards and reports for managers", "Role-based access and audit history"],
    fit: ["Off-the-shelf CRMs are too heavy or too generic for your sales process", "Leads are spread across spreadsheets, email and chat", "You want to connect sales data to your other systems"],
    tech: ["Next.js / React", "Node.js / Python", "PostgreSQL / Firebase", "REST APIs", "Email integration"],
    faqs: [
      { q: "Why build a CRM instead of buying one?", a: "If a standard CRM fits, we will tell you to use it. A custom build makes sense when your process, data or integrations are unusual, or you want to own the system." },
      { q: "Can you migrate our existing data?", a: "Yes. We import from spreadsheets and other systems and check the results with you." },
      { q: "Can it connect to our website and email?", a: "Yes. Website forms, email and other tools can feed leads into the system automatically." },
    ],
  },
  {
    slug: "erp-software-development", division: "crm-hrm-erp", name: "ERP and HRM Software",
    h1: "ERP and HRM software development for growing businesses",
    metaTitle: "ERP & HRM Software Development | Custom Business Systems",
    metaDescription: "Custom ERP, HRM, inventory, procurement and payroll-support systems that connect your operations in one platform.",
    intro: "We design and build the internal systems a business runs on: inventory, purchasing, finance workflows, people management and reporting, connected in one place.",
    build: ["Inventory, stock and procurement workflows", "Approvals, invoicing and finance process support", "Employee records, leave, attendance and onboarding", "Self-service portals for staff and customers", "Reports and dashboards across departments", "Integration with accounting and other tools you already use"],
    fit: ["Your operations run on spreadsheets and email", "Different departments keep separate, conflicting data", "A packaged ERP is too big or costly for your needs"],
    tech: ["Next.js / React", "Node.js / Python", "PostgreSQL / Firebase", "REST APIs", "Docker"],
    faqs: [
      { q: "Do you build everything at once?", a: "Usually not. We start with the module that hurts most, deliver it, and extend from there. This reduces risk and shows value early." },
      { q: "Can you integrate with our accounting software?", a: "Yes, where the accounting tool offers an API or export. We check this in discovery." },
      { q: "Is payroll included?", a: "We can build payroll support such as time and attendance data. Payroll calculation depends on local rules, which we scope carefully with you." },
    ],
  },
  {
    slug: "business-process-automation", division: "crm-hrm-erp", name: "AI and Workflow Automation",
    h1: "Business process automation with AI",
    metaTitle: "Business Process Automation | AI Workflow Automation",
    metaDescription: "Automate repetitive business work: document processing, data entry, approvals and reporting, with AI where it helps. Custom workflow automation.",
    intro: "We automate the repetitive work that eats your team's time: reading documents, moving data between systems, approvals and routine reporting, using AI where it adds value and plain rules where it doesn't.",
    build: ["Document and invoice data extraction", "Automatic data entry between your systems", "Approval workflows and notifications", "AI assistants and agents for support or internal questions", "Scheduled reports and alerts", "Connections between your tools through their APIs"],
    fit: ["People copy data between systems by hand", "You process many similar documents or emails", "You want an AI assistant connected to your own data"],
    tech: ["Python", "Node.js", "LLM APIs", "OCR", "REST APIs", "Workflow engines"],
    faqs: [
      { q: "Where does AI actually help?", a: "AI is useful for unstructured inputs such as documents, emails and free text. For structured steps, simple rules are cheaper and more reliable. We recommend the simplest approach that works." },
      { q: "How do you handle mistakes made by the AI?", a: "We design reviews and checks into the workflow so uncertain results go to a person before they cause problems." },
      { q: "Is our data kept private?", a: "We choose services and settings that suit your data and agree how it is handled before building." },
    ],
  },
  {
    slug: "computer-vision-development", division: "computer-vision", name: "Computer Vision Development",
    h1: "Computer vision development services",
    metaTitle: "Computer Vision Development | Custom AI Vision Systems",
    metaDescription: "Custom computer vision systems: object detection, tracking, OCR and video analytics from labelled data to a model running in production.",
    intro: "We build computer vision systems that detect, track, read and measure what cameras see, from the first labelled dataset to a model running reliably in production.",
    build: ["Object detection and classification", "Tracking and counting across video frames", "OCR for labels, plates and documents", "Measurement and anomaly detection from images", "Dataset preparation, labelling guidance and evaluation", "Deployment on servers, cloud or edge devices"],
    fit: ["People currently inspect or count things by eye", "You have images or video but no way to use them", "You need a model that works on your own site conditions"],
    tech: ["Python", "PyTorch / TensorFlow", "OpenCV", "YOLO", "ONNX / TensorRT", "CUDA"],
    faqs: [
      { q: "How much data do we need?", a: "It depends on the task and how varied your images are. We assess this early and tell you honestly if the data is enough." },
      { q: "How accurate will it be?", a: "We measure accuracy on your own images and agree the target with you before deployment. We don't promise numbers before seeing your data." },
      { q: "Can it run on-site without the cloud?", a: "Yes. Models can be optimised to run on local servers or edge devices." },
      { q: "Do you help with labelling the data?", a: "We guide how to collect and label data and can set up tooling for your team to do it." },
    ],
  },
  {
    slug: "ai-quality-inspection", division: "computer-vision", name: "AI Quality Inspection",
    h1: "Computer vision for quality inspection",
    metaTitle: "AI Quality Inspection | Computer Vision Defect Detection",
    metaDescription: "Automated visual inspection with computer vision: detect defects, check assembly and log results consistently, faster than manual checks.",
    intro: "Automated visual inspection checks products or surfaces with cameras and trained models, so defects are found consistently and every result is recorded.",
    build: ["Defect detection on surfaces and parts", "Presence and assembly checks", "Dimension and alignment checks from images", "Pass/fail signals to your line or operator screen", "Image and result logging for traceability", "Dashboards showing defect trends"],
    fit: ["Manual inspection is slow, tiring or inconsistent", "You need a record of every inspection", "Defects are visible in an image"],
    tech: ["OpenCV", "PyTorch", "ONNX / TensorRT", "Industrial cameras", "Edge devices"],
    faqs: [
      { q: "Can it work with our existing cameras?", a: "Often yes. Image quality and lighting matter more than the brand of camera, and we check this at the start." },
      { q: "How are false alarms handled?", a: "We tune the system with you and route uncertain cases to a person, so quality is protected while the model improves." },
      { q: "Does it need an internet connection?", a: "No. Inspection can run locally on the line." },
    ],
  },
  {
    slug: "ocr-document-processing", division: "computer-vision", name: "OCR and Document Processing",
    h1: "OCR and document data extraction",
    metaTitle: "OCR & Document Data Extraction | Automate Data Entry",
    metaDescription: "Extract text and data from invoices, forms, labels, drawings and scans automatically, with checks for accuracy.",
    intro: "We build OCR and document processing systems that turn scans, PDFs and photos into structured data you can search, check and send to your other systems.",
    build: ["Invoice, form and label extraction", "Table and field recognition", "Drawing title block and schedule reading", "Validation rules and review screens for uncertain fields", "Export to Excel, databases and business systems", "Batch processing of large archives"],
    fit: ["Staff type data from documents into another system", "You have an archive of scans that nobody can search", "Documents arrive in many different layouts"],
    tech: ["OCR engines", "Python", "OpenCV", "LLM APIs", "REST APIs", "Excel / CSV"],
    faqs: [
      { q: "How accurate is OCR?", a: "It depends on scan quality and layout. We measure on your own documents and add review steps for fields the system is unsure about." },
      { q: "Can it read handwritten text?", a: "Handwriting is harder and less reliable. We test your samples first and tell you honestly what is realistic." },
    ],
  },
  {
    slug: "edge-ai-development", division: "computer-vision", name: "Edge AI Development",
    h1: "Edge AI: computer vision on devices",
    metaTitle: "Edge AI Development | On-Device Computer Vision",
    metaDescription: "Optimised AI models running on-device (Jetson and embedded hardware) with low latency and no cloud dependency.",
    intro: "Edge AI runs your models directly on the device that has the camera, for low latency, lower running costs and operation without a constant internet connection.",
    build: ["Model optimisation for embedded hardware", "Real-time video pipelines on Jetson and similar devices", "Local processing with results sent to your systems", "Device monitoring and remote updates", "Prototype to production hardening", "Integration with sensors and PLCs where needed"],
    fit: ["Cameras are in places with poor connectivity", "Latency matters, such as on a production line", "Sending video to the cloud is too costly or not allowed"],
    tech: ["NVIDIA Jetson", "TensorRT", "ONNX", "DeepStream", "C++ / Python", "Docker"],
    faqs: [
      { q: "Which hardware do you work with?", a: "We work mainly with NVIDIA Jetson and similar embedded platforms, and recommend hardware after reviewing your requirements." },
      { q: "Can devices be updated remotely?", a: "Yes. We can build update and monitoring so you don't visit each device." },
    ],
  },
];

export const SERVICE_MAP = Object.fromEntries(SERVICES.map((s) => [s.slug, s])) as Record<string, ServicePage>;
