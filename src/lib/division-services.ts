/** The company's services under its three divisions (display lists; each links to the most relevant indexable service page). */
export interface DivisionServices { slug: "computer-vision" | "cad-bim" | "crm-hrm-erp"; name: string; short: string; landing: string; items: [name: string, href: string][] }
export const DIVISION_SERVICES: DivisionServices[] = [
  { slug: "computer-vision", name: "Computer Vision / AI / ML / DL", short: "Computer Vision and AI", landing: "/computer-vision-development", items: [
    ["Computer Vision Software Development", "/computer-vision-development"], ["Artificial Intelligence Development", "/ai-development"], ["Machine Learning Development", "/ai-development"], ["Deep Learning Solutions", "/ai-development"],
    ["CCTV Analytics", "/cctv-analytics"], ["ANPR Software Development", "/anpr-software"], ["Object Detection and Tracking", "/computer-vision-development"], ["Video Analytics", "/cctv-analytics"],
    ["Industrial Inspection AI", "/computer-vision-development"], ["Medical Imaging AI", "/medical-imaging-ai"], ["Sports Analytics", "/demos"], ["Image Processing", "/computer-vision-development"], ["Custom AI Software", "/ai-development"],
  ] },
  { slug: "cad-bim", name: "CAD/BIM Development", short: "CAD/BIM", landing: "/cad-bim-development", items: [
    ["Custom CAD Software Development", "/cad-bim-development"], ["Revit Plugin Development", "/cad-bim-development"], ["AutoCAD Plugin Development", "/cad-bim-development"], ["BIM Software Development", "/cad-bim-development"],
    ["CAD Automation", "/cad-bim-development"], ["Point Cloud Processing", "/3d-reconstruction"], ["Point Cloud to CAD/BIM Conversion", "/cad-bim-development"], ["Scan-to-BIM", "/cad-bim-development"],
    ["3D Reconstruction Software", "/3d-reconstruction"], ["Photogrammetry Applications", "/3d-reconstruction"], ["Engineering Software", "/cad-bim-development"], ["3D Modeling and Visualization", "/3d-reconstruction"],
  ] },
  { slug: "crm-hrm-erp", name: "CRM/HRM/ERP Development", short: "CRM/HRM/ERP", landing: "/crm-erp-development", items: [
    ["Custom CRM Development", "/crm-erp-development"], ["HRM Software Development", "/crm-erp-development"], ["ERP Software Development", "/crm-erp-development"], ["Inventory Management Systems", "/crm-erp-development"],
    ["Business Management Software", "/crm-erp-development"], ["Workflow Automation", "/crm-erp-development"], ["Enterprise Software Development", "/crm-erp-development"], ["Business Intelligence", "/crm-erp-development"],
    ["Custom Dashboards", "/crm-erp-development"], ["Third-party Integrations", "/crm-erp-development"],
  ] },
];
