/** Fictional workforce shared by HRM, payroll, CRM (sales owners), support (agents), projects (resources). */
export interface Employee { id: string; name: string; email: string; phone: string; dept: string; position: string; status: "Active" | "Probation" | "On leave" | "Resigned"; type: "Full-time" | "Part-time" | "Contract"; hireDate: string; salary: number; location: string; managerId: string; notes: string[]; docs?: EmpDoc[] }
export interface EmpDoc { id: string; name: string; kind: string; date: string }
export interface Department { id: string; name: string; headId: string; budget: number }
export interface Position { id: string; title: string; dept: string; level: string; openings: number; min: number; max: number }
export interface OnboardTask { id: string; task: string; owner: string; done: boolean }
export interface Onboarding { id: string; empId: string; startDate: string; items: OnboardTask[] }
export interface LeaveReq { id: string; empId: string; type: "Annual" | "Sick" | "Parental" | "Unpaid"; from: string; to: string; days: number; reason: string; status: "Pending" | "Approved" | "Rejected"; decidedBy?: string; submitted: string }
export interface Review { id: string; empId: string; period: string; rating: number; reviewerId: string; notes: string; goals: string; status: "Draft" | "Completed"; date: string }

const E = (id: string, name: string, dept: string, position: string, salary: number, hire: string, mgr: string, loc = "Austin, US", status: Employee["status"] = "Active", type: Employee["type"] = "Full-time"): Employee => ({
  id, name, dept, position, salary, hireDate: hire, managerId: mgr, location: loc, status, type, notes: [],
  email: `${name.toLowerCase().replace(/[^a-z ]/g, "").replace(" ", ".")}@northpeak-demo.example`, phone: `+1 512 555 01${id.slice(1)}`,
});
export const seedHrm = () => ({
  employees: [
    E("e01", "Amara Okafor", "Sales", "Sales Director", 128000, "2019-02-04", ""), E("e02", "Daniel Reyes", "Sales", "Account Executive", 82000, "2021-05-17", "e01"), E("e03", "Priya Nair", "Sales", "Account Executive", 84000, "2020-09-01", "e01", "London, UK"),
    E("e04", "Lucas Meyer", "Sales", "Sales Development Rep", 54000, "2024-01-15", "e01", "Austin, US", "Active"), E("e05", "Hannah Cole", "Sales", "Account Executive", 79000, "2022-03-07", "e01", "Remote"), E("e06", "Tomás Silva", "Sales", "Sales Ops Analyst", 66000, "2023-06-12", "e01"),
    E("e07", "Zoe Laurent", "Marketing", "Marketing Manager", 92000, "2020-01-20", "e01"), E("e08", "Kwame Boateng", "Marketing", "Content Specialist", 61000, "2022-08-22", "e07", "London, UK"), E("e09", "Mei Lin", "Marketing", "Digital Marketing Specialist", 64000, "2023-02-13", "e07", "Remote"),
    E("e10", "Oliver Grant", "Finance", "Finance Manager", 105000, "2018-07-09", ""), E("e11", "Fatima Al-Sayed", "Finance", "Accountant", 72000, "2021-11-01", "e10"), E("e12", "Noah Fischer", "Finance", "AP/AR Clerk", 52000, "2023-09-18", "e10"), E("e13", "Ingrid Larsen", "Finance", "Payroll Specialist", 68000, "2022-04-04", "e10"),
    E("e14", "Rajesh Patel", "Engineering", "Engineering Lead", 135000, "2018-03-12", ""), E("e15", "Sofia Marino", "Engineering", "Senior Developer", 112000, "2020-10-05", "e14"), E("e16", "Ethan Brooks", "Engineering", "Developer", 88000, "2022-06-27", "e14", "Remote"), E("e17", "Aisha Bello", "Engineering", "QA Engineer", 78000, "2023-01-09", "e14"), E("e18", "Mateo Alvarez", "Engineering", "Project Manager", 98000, "2021-02-15", "e14"), E("e19", "Chloe Dubois", "Engineering", "UX Designer", 86000, "2022-09-12", "e14", "London, UK"),
    E("e20", "Victor Novak", "Operations", "Operations Manager", 99000, "2019-05-20", ""), E("e21", "Grace Mwangi", "Operations", "Warehouse Supervisor", 63000, "2021-08-30", "e20"), E("e22", "Jamal Carter", "Operations", "Procurement Officer", 69000, "2022-01-24", "e20"), E("e23", "Elena Petrova", "Operations", "Logistics Coordinator", 58000, "2024-02-05", "e20", "Austin, US", "Probation"),
    E("e24", "Sam Taylor", "Customer Support", "Support Lead", 76000, "2020-04-14", ""), E("e25", "Nadia Hussein", "Customer Support", "Support Agent", 51000, "2022-10-03", "e24", "London, UK"), E("e26", "Leo Chen", "Customer Support", "Support Agent", 50000, "2023-03-20", "e24", "Remote"), E("e27", "Isabel Costa", "Customer Support", "Support Agent", 49000, "2024-02-19", "e24", "Austin, US", "Probation"),
    E("e28", "Marcus Webb", "Human Resources", "HR Manager", 95000, "2019-09-02", ""), E("e29", "Yuki Tanaka", "Human Resources", "HR Generalist", 62000, "2022-05-16", "e28", "Austin, US", "On leave"), E("e30", "Rosa Delgado", "Human Resources", "Recruiter", 64000, "2023-07-10", "e28", "Remote", "Active", "Contract"),
  ] as Employee[],
  departments: [
    { id: "d1", name: "Sales", headId: "e01", budget: 640000 }, { id: "d2", name: "Marketing", headId: "e07", budget: 310000 }, { id: "d3", name: "Finance", headId: "e10", budget: 295000 }, { id: "d4", name: "Engineering", headId: "e14", budget: 820000 },
    { id: "d5", name: "Operations", headId: "e20", budget: 380000 }, { id: "d6", name: "Customer Support", headId: "e24", budget: 260000 }, { id: "d7", name: "Human Resources", headId: "e28", budget: 240000 },
  ] as Department[],
  positions: [
    { id: "p1", title: "Account Executive", dept: "Sales", level: "Mid", openings: 1, min: 70000, max: 95000 }, { id: "p2", title: "Sales Development Rep", dept: "Sales", level: "Junior", openings: 0, min: 48000, max: 60000 },
    { id: "p3", title: "Marketing Specialist", dept: "Marketing", level: "Mid", openings: 1, min: 55000, max: 72000 }, { id: "p4", title: "Accountant", dept: "Finance", level: "Mid", openings: 0, min: 62000, max: 80000 },
    { id: "p5", title: "Senior Developer", dept: "Engineering", level: "Senior", openings: 2, min: 100000, max: 130000 }, { id: "p6", title: "Developer", dept: "Engineering", level: "Mid", openings: 1, min: 76000, max: 98000 },
    { id: "p7", title: "QA Engineer", dept: "Engineering", level: "Mid", openings: 0, min: 68000, max: 88000 }, { id: "p8", title: "Project Manager", dept: "Engineering", level: "Senior", openings: 0, min: 88000, max: 110000 },
    { id: "p9", title: "Warehouse Supervisor", dept: "Operations", level: "Mid", openings: 0, min: 56000, max: 72000 }, { id: "p10", title: "Logistics Coordinator", dept: "Operations", level: "Junior", openings: 1, min: 50000, max: 64000 },
    { id: "p11", title: "Support Agent", dept: "Customer Support", level: "Junior", openings: 2, min: 44000, max: 56000 }, { id: "p12", title: "Support Lead", dept: "Customer Support", level: "Senior", openings: 0, min: 68000, max: 84000 },
    { id: "p13", title: "HR Generalist", dept: "Human Resources", level: "Mid", openings: 0, min: 55000, max: 70000 }, { id: "p14", title: "Recruiter", dept: "Human Resources", level: "Mid", openings: 0, min: 56000, max: 72000 },
  ] as Position[],
  onboarding: [
    { id: "ob1", empId: "e27", startDate: "2024-02-19", items: [{ id: "t1", task: "Sign employment contract", owner: "HR", done: true }, { id: "t2", task: "Issue laptop and accounts", owner: "IT", done: true }, { id: "t3", task: "Complete security awareness training", owner: "Employee", done: true }, { id: "t4", task: "Shadow two senior agents", owner: "Manager", done: false }, { id: "t5", task: "30-day check-in", owner: "Manager", done: false }] },
    { id: "ob2", empId: "e23", startDate: "2024-02-05", items: [{ id: "t6", task: "Sign employment contract", owner: "HR", done: true }, { id: "t7", task: "Warehouse safety induction", owner: "Manager", done: true }, { id: "t8", task: "Issue badge and PPE", owner: "Operations", done: false }, { id: "t9", task: "Probation goals agreed", owner: "Manager", done: false }] },
  ] as Onboarding[],
  leave: [
    { id: "l1", empId: "e02", type: "Annual", from: "2026-03-23", to: "2026-03-27", days: 5, reason: "Family trip", status: "Pending", submitted: "2026-03-02" },
    { id: "l2", empId: "e15", type: "Annual", from: "2026-04-06", to: "2026-04-10", days: 5, reason: "Holiday", status: "Pending", submitted: "2026-03-09" },
    { id: "l3", empId: "e25", type: "Sick", from: "2026-03-10", to: "2026-03-11", days: 2, reason: "Flu", status: "Approved", decidedBy: "e24", submitted: "2026-03-10" },
    { id: "l4", empId: "e29", type: "Parental", from: "2026-02-16", to: "2026-05-15", days: 63, reason: "Parental leave", status: "Approved", decidedBy: "e28", submitted: "2026-01-12" },
    { id: "l5", empId: "e09", type: "Annual", from: "2026-02-02", to: "2026-02-06", days: 5, reason: "Rest", status: "Approved", decidedBy: "e07", submitted: "2026-01-14" },
    { id: "l6", empId: "e16", type: "Annual", from: "2026-03-30", to: "2026-04-03", days: 5, reason: "Moving house", status: "Rejected", decidedBy: "e14", submitted: "2026-03-05" },
    { id: "l7", empId: "e11", type: "Annual", from: "2026-01-05", to: "2026-01-09", days: 5, reason: "Winter break", status: "Approved", decidedBy: "e10", submitted: "2025-12-01" },
    { id: "l8", empId: "e21", type: "Sick", from: "2026-02-24", to: "2026-02-24", days: 1, reason: "Appointment", status: "Approved", decidedBy: "e20", submitted: "2026-02-23" },
    { id: "l9", empId: "e05", type: "Unpaid", from: "2026-04-20", to: "2026-04-22", days: 3, reason: "Personal", status: "Pending", submitted: "2026-03-12" },
  ] as LeaveReq[],
  leaveAdj: [] as { id: string; empId: string; type: string; days: number; reason: string }[],
  reviews: [
    { id: "r1", empId: "e02", period: "2025 H2", rating: 4, reviewerId: "e01", notes: "Closed two enterprise deals; improve CRM hygiene.", goals: "Grow mid-market pipeline by 20%", status: "Completed", date: "2026-01-20" },
    { id: "r2", empId: "e15", period: "2025 H2", rating: 5, reviewerId: "e14", notes: "Led the platform migration with no downtime.", goals: "Mentor two developers", status: "Completed", date: "2026-01-22" },
    { id: "r3", empId: "e25", period: "2025 H2", rating: 4, reviewerId: "e24", notes: "Consistently high CSAT; strong on escalations.", goals: "Cross-train on billing queries", status: "Completed", date: "2026-01-25" },
    { id: "r4", empId: "e16", period: "2025 H2", rating: 3, reviewerId: "e14", notes: "Solid delivery; needs more test coverage.", goals: "Raise coverage to 80%", status: "Completed", date: "2026-01-27" },
    { id: "r5", empId: "e27", period: "2026 Probation", rating: 0, reviewerId: "e24", notes: "", goals: "Reach full ticket queue by month 3", status: "Draft", date: "2026-03-01" },
  ] as Review[],
});
export const LEAVE_ENTITLEMENT: Record<string, number> = { Annual: 20, Sick: 10, Parental: 90, Unpaid: 30 };

export const ONBOARD_TEMPLATE = [["Sign employment contract", "HR"], ["Issue laptop and accounts", "IT"], ["Complete security awareness training", "Employee"], ["Meet the team and manager", "Manager"], ["Set 30/60/90-day goals", "Manager"], ["Benefits enrolment", "HR"]];
