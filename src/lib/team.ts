// Team profiles shown on the About page. To add a person, copy the TEMPLATE below, fill it in, and add it to TEAM (order = display order).
export interface TeamMember {
  title: string; name: string; department: string; level: string; reportsTo: string; company: string;
  overview: string; responsibilities: string[]; designation: string;
}

/* TEMPLATE
  {
    title: "Job title", name: "Full name", department: "Department", level: "Position level", reportsTo: "Team", company: "Neo Forge Technology",
    overview: "Role overview text.",
    responsibilities: ["First responsibility.", "Second responsibility."],
    designation: "Job title | Neo Forge Technology",
  },
*/
const C = "Neo Forge Technology";
export const TEAM: TeamMember[] = [
  {
    title: "Technical Development Coordinator", name: "Lukado", department: "Technology & Software Development", level: "Mid-Level Management / Coordination", reportsTo: "Team", company: C,
    overview: "The Technical Development Coordinator is responsible for coordinating the company's technical activities, managing website operations, handling client communications and supporting collaboration across the various software development departments.",
    responsibilities: ["Manage and maintain the company website.", "Respond to client inquiries and business messages.", "Coordinate communication between clients and technical teams.", "Maintain a general understanding of CAD/BIM, AI/Computer Vision and CRM/ERP/HRM solutions.", "Monitor project updates and development progress.", "Coordinate website content, service updates and portfolio uploads.", "Assist with technical documentation and administrative activities.", "Forward technical requests to the appropriate department leaders."],
    designation: "Technical Development Coordinator | Neo Forge Technology",
  },
  {
    title: "Head of CAD/BIM Software Development", name: "Gamal Saied", department: "CAD/BIM Technology & Software Development", level: "Senior Management / Department Head", reportsTo: "Team", company: C,
    overview: "The Head of CAD/BIM Software Development is responsible for leading and overseeing the company's CAD/BIM software development department. This includes managing development teams, supervising technical projects, driving innovation and developing specialized software solutions for architecture, engineering, construction and design industries.",
    responsibilities: ["Lead and manage the CAD/BIM software development team.", "Oversee the development of custom CAD and BIM software solutions.", "Supervise the development of Revit plugins, AutoCAD plugins and engineering applications.", "Establish technical standards, development workflows and software architecture.", "Coordinate project planning, task allocation and development timelines.", "Research and implement new CAD/BIM technologies and industry innovations.", "Ensure software quality, testing, performance and deployment.", "Collaborate with other departments on integrated software development projects.", "Review technical deliverables and ensure projects meet client requirements.", "Provide regular departmental progress reports to the team."],
    designation: "Head of CAD/BIM Software Development | Neo Forge Technology",
  },
  {
    title: "CAD/BIM & Automation Development Specialist", name: "Asad Hamid", department: "CAD/BIM Technology & Software Development", level: "Senior Technical Specialist", reportsTo: "Head of CAD/BIM Software Development", company: C,
    overview: "The CAD/BIM & Automation Development Specialist is responsible for developing and delivering specialized CAD/BIM solutions, with a primary focus on SketchUp modelling, customization and automation. The role also covers the development of automation tools, websites, software applications, bots and Python-based scripts to improve engineering workflows, streamline business processes and solve technical challenges.",
    responsibilities: ["Develop and manage SketchUp-based modelling and design solutions.", "Create custom SketchUp extensions, plugins and automation tools.", "Develop Python scripts for CAD/BIM automation and workflow optimization.", "Build custom software applications and web-based solutions.", "Develop bots and automated systems for repetitive technical tasks.", "Create tools that improve productivity across CAD/BIM workflows.", "Assist with integrating third-party APIs and software platforms.", "Research new automation technologies and development approaches.", "Collaborate with the CAD/BIM team on technical projects and software solutions.", "Test, troubleshoot and maintain developed tools, scripts and applications.", "Support the development of custom solutions based on client requirements.", "Provide technical updates and report development progress to the department leadership."],
    designation: "CAD/BIM & Automation Development Specialist | Neo Forge Technology",
  },
  {
    title: "Head of CRM/ERP/HRM Software Development", name: "Charles", department: "Business Software & Enterprise Solutions Development", level: "Senior Management / Department Head", reportsTo: "Team", company: C,
    overview: "The Head of CRM/ERP/HRM Software Development is responsible for leading and overseeing the development of the company's business management software solutions. This includes managing software development activities, coordinating developers, designing enterprise applications and delivering customized CRM, ERP and HRM platforms to meet business and organizational needs.",
    responsibilities: ["Lead and coordinate CRM, ERP and HRM software development activities.", "Manage developers working on enterprise software solutions.", "Oversee the development of custom CRM systems for customer and sales management.", "Supervise ERP solutions for business operations, finance, inventory and resource management.", "Oversee HRM platforms for employee management, recruitment, payroll and administration.", "Establish software architecture, development standards and technical workflows.", "Coordinate project planning, task allocation and development timelines.", "Ensure software quality, testing, security and deployment.", "Research and implement new enterprise software technologies.", "Coordinate API integrations and connections with third-party business platforms.", "Review technical deliverables and ensure solutions meet client requirements.", "Provide regular departmental progress reports to the team."],
    designation: "Head of CRM/ERP/HRM Software Development | Neo Forge Technology",
  },
  {
    title: "Head of Computer Vision & AI Development", name: "Deepak", department: "Artificial Intelligence, Computer Vision & Machine Learning", level: "Senior Management / Department Head", reportsTo: "Team", company: C,
    overview: "The Head of Computer Vision & AI Development is responsible for leading the company's artificial intelligence, computer vision and machine learning development activities. This includes overseeing AI-powered applications, image processing systems, video analytics, intelligent automation and deep learning solutions for different industries.",
    responsibilities: ["Lead and coordinate the Computer Vision and AI development team.", "Oversee the development of AI and machine learning applications.", "Supervise computer vision projects involving image and video processing.", "Manage the development of object detection, tracking and recognition systems.", "Oversee deep learning model development, training and optimization.", "Lead projects involving OpenCV, YOLO, TensorFlow and PyTorch.", "Coordinate AI-powered automation and intelligent software development.", "Research and implement emerging AI and computer vision technologies.", "Supervise model testing, evaluation, deployment and performance optimization.", "Coordinate AI integration with web applications, mobile apps and enterprise software.", "Ensure technical solutions meet project specifications and client requirements.", "Provide regular departmental progress reports to the team."],
    designation: "Head of Computer Vision & AI Development | Neo Forge Technology",
  },
];
