import type { DivisionSlug } from "./divisions";

/** Options of the project inquiry form. Services map onto the existing project types and divisions so older inquiries, filters and emails keep working. */
export const SERVICE_OPTIONS: { value: string; division: DivisionSlug | ""; projectType: string }[] = [
  { value: "Computer vision development", division: "computer-vision", projectType: "Computer Vision" },
  { value: "AI and machine learning software", division: "computer-vision", projectType: "AI" },
  { value: "CCTV analytics and video intelligence", division: "computer-vision", projectType: "Computer Vision" },
  { value: "ANPR / licence plate recognition", division: "computer-vision", projectType: "Computer Vision" },
  { value: "3D reconstruction, photogrammetry and point clouds", division: "cad-bim", projectType: "Custom Software" },
  { value: "CAD and BIM software development", division: "cad-bim", projectType: "BIM" },
  { value: "CRM, ERP or HRM software", division: "crm-hrm-erp", projectType: "ERP" },
  { value: "Business automation and workflow software", division: "crm-hrm-erp", projectType: "AI Automation" },
  { value: "Medical imaging software (research and workflow)", division: "computer-vision", projectType: "Deep Learning" },
  { value: "Other or not sure yet", division: "", projectType: "Other" },
];
export const BUDGETS = ["Under $5k", "$5k – $15k", "$15k – $50k", "$50k – $150k", "$150k+", "Not sure yet"];
/** The form's existing "Prefer to discuss" choice. It used to be the empty value; it is now a real choice because the budget is compulsory. */
export const BUDGET_DISCUSS = "Prefer to discuss";
export const TIMELINES = ["ASAP", "1–3 months", "3–6 months", "6+ months", "Flexible"];
export const CURRENCIES = ["USD", "GBP", "EUR", "CAD", "AUD"] as const;
export const CONTACT_METHODS = [["email", "Email"], ["video", "Video call"], ["phone", "Phone call"], ["whatsapp", "WhatsApp"]] as const;
export type ContactMethod = (typeof CONTACT_METHODS)[number][0];
export const serviceInfo = (v: string) => SERVICE_OPTIONS.find((s) => s.value === v);
