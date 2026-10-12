/** Per-service wording for the "How it works", "Typical uses" and closing call-to-action, so no two service pages repeat each other. */
export interface ServiceExtra {
  /** Four steps: discovery, scope, build, delivery */
  process: [string, string, string, string];
  useCases: string[];
  cta: string;
}

export const PROCESS_TITLES = ["Discovery", "Scope and plan", "Build and review", "Deliver and support"] as const;

export const EXTRAS: Record<string, ServiceExtra> = {
  "revit-plugin-development": {
    process: ["We watch how your team does the task in Revit today and list the clicks, parameters and checks involved.", "You get a written plan: what the tool does, which Revit versions it supports, timeline and price.", "We share a working version early so your BIM team can try it on a real model and steer the details.", "We install it, document it, train your team and offer support when a new Revit version comes out."],
    useCases: ["Fill and check shared parameters across thousands of elements in minutes", "Create sheets, views and schedules from one template for every new project", "Run an office-standard model check before each issue"],
    cta: "Tell us which Revit task your team repeats most. We will reply with questions and a view on what can be automated.",
  },
  "ifc-data-validation-tool": {
    process: ["We collect your information requirements, BIM execution plan and a few sample models.", "We turn each rule into a testable check and agree how results will be reported.", "We run the checks on real models with you and tune them until the findings are useful, not noisy.", "We hand over the tool, the rule set and a guide so you can update rules as standards change."],
    useCases: ["Check models from consultants before accepting them", "Confirm required properties and classifications at each project stage", "Give the design team a clear, shareable list of what to fix"],
    cta: "Send us your information requirements or a sample model, and we will tell you which checks can be automated.",
  },
  "autocad-plugin-development": {
    process: ["We review your drawing standards and the steps your drafters repeat in AutoCAD.", "We agree which steps become commands, which stay manual, and the AutoCAD versions to support.", "We build the commands and test them on your own drawings, including awkward legacy ones.", "We package the tool for your team, document it and provide updates when you upgrade AutoCAD."],
    useCases: ["Update title blocks and attributes across a full drawing set", "Extract block and layer data into a spreadsheet", "Replace an old AutoLISP routine nobody can maintain"],
    cta: "Describe the drawing task that eats your drafters' time, and we will tell you how we would automate it.",
  },
  "sketchup-extension-development": {
    process: ["We look at how your team models in SketchUp and where steps repeat.", "We define the toolbar buttons and dialogs the extension will have, and the SketchUp versions it must support.", "We build in Ruby and test on Mac and Windows with your own models.", "We deliver a packaged extension with install steps and a short guide."],
    useCases: ["Clean and name a messy model with one click", "Generate repeating model elements from a spreadsheet", "Export a parts or area report from the model"],
    cta: "Tell us what your SketchUp modellers repeat most, and we will suggest an extension that removes it.",
  },
  "bricscad-plugin-development": {
    process: ["We review your BricsCAD setup, templates and the tools you rely on today.", "We decide whether to build new commands or port existing AutoCAD tools, and estimate effort.", "We build and test inside BricsCAD with your drawings.", "We deliver, document and support the tools as BricsCAD versions change."],
    useCases: ["Move an AutoCAD toolset to BricsCAD", "Add custom commands that follow your drafting standard", "Batch process drawings after a platform change"],
    cta: "Tell us what you need in BricsCAD, or which AutoCAD tools you want moved over.",
  },
  "cad-automation-software": {
    process: ["We map your drafting workflow from first drawing to issued set and time each step.", "We pick the steps worth automating first and agree the report you will see before any change is applied.", "We build in stages and run the automation on copies of real drawings so you can check results.", "We train your drafters and leave you with a simple way to run and update the automation."],
    useCases: ["Plot and publish a whole drawing set in one run", "Check layers, text and blocks against your standard and list the exceptions", "Pull drawing data into a register without retyping it"],
    cta: "Send us a typical drawing set and tell us where the time goes. We will show you what we would automate.",
  },
  "engineering-software-development": {
    process: ["We collect your calculations, codes and company rules, and the worked examples that prove them.", "We agree inputs, outputs and warnings, and who in your team signs off the rules.", "We build the tool and test it against your worked examples until the results match.", "We deliver it with calculation reports, version history and a way to update rules safely."],
    useCases: ["Replace a fragile calculation spreadsheet with a checked tool", "Let sales or clients select and size standard components", "Produce calculation sheets automatically for every project"],
    cta: "Send us the spreadsheet or procedure you rely on. We will tell you how it could become reliable software.",
  },
  "sketchup-dynamic-components-development": {
    process: ["We list the products or elements you model, their options and the sizes that matter.", "We define the attributes, formulas and option menus, and what quantities the component must report.", "We build the components and test every size and option combination.", "We organise the library, document how it works and show your team how to maintain it."],
    useCases: ["A cabinet or window that resizes and reports its parts", "A configurator customers use to choose options before ordering", "A tidy library that replaces dozens of near-duplicate components"],
    cta: "Tell us what you model again and again, and we will show how it could become one configurable component.",
  },
  "custom-crm-development": {
    process: ["We follow a real lead from first enquiry to closed deal and note where information gets lost.", "We design the stages, fields and reports around your sales process and agree what to import.", "We build the core pipeline first, load your data, and have your sales team use it early.", "We train the team, tune the reports they ask for, and support you through the first months."],
    useCases: ["Capture website enquiries straight into a pipeline", "Remind the team when a follow-up is due", "Show the manager the pipeline and forecast on one screen"],
    cta: "Tell us how your team sells today. We will reply with how a custom CRM would fit, and whether you need one at all.",
  },
  "hrm-software-development": {
    process: ["We go through your HR policies: leave rules, shifts, approvals and the records you must keep.", "We agree the modules to build first and which payroll or accounting tools it must connect to.", "We build the staff portal and HR screens, then test the rules with real scenarios.", "We migrate your records, train HR and managers, and support the first leave and review cycles."],
    useCases: ["Staff request leave and see their balance without emailing HR", "New-starter checklists that make sure nothing is forgotten", "Attendance and leave data ready for payroll"],
    cta: "Tell us how HR runs today and what hurts most. We will suggest where a custom system helps.",
  },
  "erp-software-development": {
    process: ["We follow an order from quote to delivery to invoice and see where departments re-enter data.", "We agree the first module, such as stock or purchasing, and the full roadmap behind it.", "We build and release module by module, running it alongside your current process until you trust it.", "We migrate data, train each team and support you while the next module is added."],
    useCases: ["Live stock levels instead of weekly spreadsheet counts", "Purchase approvals with a clear audit trail", "One place to see orders, deliveries and invoices"],
    cta: "Describe how an order moves through your business today, and we will show where a custom system would help most.",
  },
  "ai-automation-for-business": {
    process: ["We collect a sample of the documents or requests you handle and see how people deal with them today.", "We pick the fields and decisions to automate, set accuracy targets, and decide what a person still reviews.", "We build and measure on your own samples, improving until the results meet the target.", "We connect it to your systems, train staff on the review screen, and monitor quality after launch."],
    useCases: ["Read supplier invoices and enter them into accounting", "Sort incoming emails to the right team with a suggested reply", "Pull key terms out of contracts into a register"],
    cta: "Send us a few typical documents or emails. We will tell you honestly whether AI helps and how much.",
  },
  "ai-agent-development": {
    process: ["We pick one narrow job for the agent and gather the documents, systems and examples it will use.", "We write down what the agent may do, what needs approval and how mistakes are caught.", "We build it, test it against real questions and tasks, and tune it with your team.", "We launch to a small group first, watch the logs, then widen access as quality holds."],
    useCases: ["An assistant that answers staff questions from your handbook", "A first-reply agent for common customer questions that hands off the rest", "An agent that prepares weekly reports for a person to approve"],
    cta: "Tell us one repeated task you would like an assistant to handle. We will suggest what is safe to automate.",
  },
  "business-process-automation": {
    process: ["We map one process end to end: who does what, with which tool, and where it waits.", "We agree the rules, approvals and which systems must be connected.", "We build the workflow, test it with real cases, and run it alongside the manual process first.", "We switch over, document the rules, and show you how to adjust them yourself."],
    useCases: ["Expense or purchase approvals that route themselves and remind approvers", "New customer details copied from the CRM into accounting automatically", "A weekly report that arrives by email without anyone building it"],
    cta: "Tell us about a process where work gets stuck or is retyped. We will map how it could run by itself.",
  },
  "business-intelligence-dashboards": {
    process: ["We list the decisions you want to make faster and the numbers behind them.", "We agree definitions (what counts as a sale, an active customer) and which systems the data comes from.", "We build the data connections and a first dashboard, then refine it with the people who use it.", "We schedule the refreshes and reports, document the definitions and train your team."],
    useCases: ["A sales dashboard that everyone trusts", "A weekly operations report sent automatically", "A project view showing budget, progress and risks together"],
    cta: "Tell us which numbers you chase every week. We will show how to put them on one screen.",
  },
  "computer-vision-development": {
    process: ["We review your images or video, cameras and the decision you want made automatically.", "A short feasibility step on your own images shows what is realistic, then you get a proposal.", "We label data, train and test, and report accuracy on images the model has never seen.", "We deploy to your servers, cloud or devices, hand over documentation and monitor results."],
    useCases: ["Replace manual checking of photos or video", "Turn site camera footage into counts and alerts", "Read values from gauges, labels or documents automatically"],
    cta: "Send us a handful of your images or a short clip. We will tell you what vision can and cannot do with them.",
  },
  "object-detection-development": {
    process: ["We collect sample images from your real cameras and list the objects to find.", "We agree how to label them and what precision and recall you need.", "We train, test on held-out images from your site, and review the errors with you.", "We deploy the detector, document how to retrain it, and monitor results after launch."],
    useCases: ["Detect missing safety equipment in site photos", "Count products on a conveyor or shelf", "Spot damaged parts before packing"],
    cta: "Show us the objects you need found and a few sample images. We will tell you how we would approach it.",
  },
  "object-tracking-development": {
    process: ["We study your camera views and what you want counted or timed.", "We agree counting lines, zones and privacy rules for what is stored.", "We build and test on your own footage, comparing counts with manual checks.", "We deliver dashboards and exports and tune the system for busy and quiet periods."],
    useCases: ["Count visitors entering and leaving", "Measure queue length and waiting time", "Show how vehicles move through a yard or car park"],
    cta: "Tell us what you want to count or time on camera, and we will suggest how to measure it.",
  },
  "video-analytics-software": {
    process: ["We list your cameras, the events that matter and who should be alerted.", "We agree the rules, alert channels and how long footage is kept.", "We build the pipeline for your streams and tune alerts against recorded footage first.", "We go live on a few cameras, review false alerts with you, then extend to the rest."],
    useCases: ["Alert a supervisor when someone enters a restricted area", "Daily counts and trends from several cameras on one dashboard", "Short clips saved automatically for each safety event"],
    cta: "Tell us about your cameras and the events you need to know about. We will outline an approach.",
  },
  "machine-learning-development": {
    process: ["We look at your data, the decision you want to improve and how it is made today.", "We agree a measurable goal and a simple baseline the model must beat.", "We build and test models on data they have not seen and show you the result in plain terms.", "We deploy the model, set up monitoring and plan retraining as your data changes."],
    useCases: ["Forecast demand or workload", "Flag unusual transactions or sensor readings", "Score leads or requests by likelihood to convert"],
    cta: "Tell us the decision you would like to improve and what data you have. We will say whether machine learning is worth it.",
  },
  "deep-learning-development": {
    process: ["We review your data, accuracy needs and the hardware the model must run on.", "We choose a starting architecture and agree how success will be measured.", "We fine-tune, train and test, tracking each experiment so results can be reproduced.", "We optimise for speed, package the model and hand over the training pipeline."],
    useCases: ["Classify images that simpler methods cannot separate", "Process audio or sensor signals for events", "Speed up a model so it runs on a small device"],
    cta: "Describe your data and what the model must decide. We will tell you whether a neural network is the right tool.",
  },
  "ai-quality-inspection": {
    process: ["We see your line, the defects that matter and how inspectors judge them today.", "We agree the camera and lighting set-up, the defect list and the pass/fail targets.", "We collect examples, train and test on your products, and measure missed and false detections.", "We install on the line, connect the pass/fail signal and keep tuning with your quality team."],
    useCases: ["Find scratches or dents on surfaces", "Check that all parts are present in an assembly", "Log an image and result for every product inspected"],
    cta: "Send us photos of good and defective parts. We will tell you if automated inspection suits your product.",
  },
  "ocr-document-processing": {
    process: ["We gather samples of your documents in all their layouts and quality levels.", "We choose the fields to extract, the checks to run and what a person reviews.", "We build and measure accuracy field by field on your samples.", "We connect it to your systems, add the review screen and monitor accuracy as new layouts arrive."],
    useCases: ["Extract totals and dates from supplier invoices", "Read labels and serial numbers from photos", "Turn an archive of scanned drawings into searchable data"],
    cta: "Send us a few sample documents. We will tell you what can be read reliably.",
  },
  "edge-ai-development": {
    process: ["We review your devices, power, network and the speed you need.", "We choose hardware and agree the model size and update method.", "We optimise the model for the device and test it in your real environment.", "We deploy to the devices, set up monitoring and remote updates, and document maintenance."],
    useCases: ["Inspect products on a line with no internet connection", "Detect events on a remote site and send only the results", "Run a camera model on a small device instead of a server"],
    cta: "Tell us where the cameras are and what the device must do. We will suggest suitable hardware and an approach.",
  },
};
