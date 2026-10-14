export type DiagramFamily = "mermaid" | "plantuml";
export interface DiagramTemplate {
  id: string;
  source: string;
  selection: string;
}

/** Small, self-contained examples. No remote includes or renderer imports here. */
export const DIAGRAM_TEMPLATES: Record<DiagramFamily, DiagramTemplate[]> = {
  mermaid: [
    { id: "flowchart", source: "flowchart LR\n  A[Start] --> B{Ready?}\n  B -->|Yes| C[Finish]\n  B -->|No| A", selection: "Start" },
    { id: "sequence", source: "sequenceDiagram\n  participant A as Client\n  participant B as Server\n  A->>B: Request\n  B-->>A: Response", selection: "Request" },
    { id: "class", source: "classDiagram\n  class Project {\n    +String name\n    +start()\n  }\n  class Task {\n    +String title\n    +complete()\n  }\n  Project \"1\" *-- \"many\" Task", selection: "Project" },
    { id: "state", source: "stateDiagram-v2\n  [*] --> Pending\n  Pending --> Active: Start\n  Active --> Complete: Finish\n  Complete --> [*]", selection: "Pending" },
    { id: "er", source: "erDiagram\n  CUSTOMER ||--o{ ORDER : places\n  CUSTOMER {\n    int id PK\n    string name\n  }\n  ORDER {\n    int id PK\n    int customer_id FK\n  }", selection: "CUSTOMER" },
    { id: "gantt", source: "gantt\n  title Project plan\n  dateFormat YYYY-MM-DD\n  section Development\n  Design :a1, 2026-01-01, 7d\n  Build :after a1, 14d", selection: "2026-01-01" },
    { id: "pie", source: "pie title Time allocation\n  \"Design\" : 30\n  \"Development\" : 50\n  \"Testing\" : 20", selection: "Time allocation" },
    { id: "mindmap", source: "mindmap\n  root((Project))\n    Planning\n      Goals\n      Schedule\n    Delivery\n      Build\n      Review", selection: "Project" },
    { id: "timeline", source: "timeline\n  title Project milestones\n  Week 1 : Planning\n  Week 2 : Design\n  Week 3 : Delivery", selection: "Project milestones" },
    { id: "journey", source: "journey\n  title User journey\n  section Getting started\n    Discover: 5: User\n    Sign up: 3: User\n  section Using the product\n    Create project: 4: User\n    Get help: 3: User, Support", selection: "User journey" },
    { id: "git", source: "gitGraph\n  commit id: \"Initial\"\n  branch feature\n  checkout feature\n  commit id: \"Implement\"\n  checkout main\n  merge feature\n  commit id: \"Release\"", selection: "Initial" },
  ],
  plantuml: [
    { id: "sequence", source: "@startuml\nAlice -> Bob: Request\nactivate Bob\nBob --> Alice: Response\ndeactivate Bob\n@enduml", selection: "Request" },
    { id: "activity", source: "@startuml\nstart\n:Prepare;\nif (Ready?) then (yes)\n  :Deliver;\nelse (no)\n  :Revise;\nendif\nstop\n@enduml", selection: "Prepare" },
    { id: "class", source: "@startuml\nclass Project {\n  +name: String\n  +start()\n}\nclass Task {\n  +title: String\n  +complete()\n}\nProject \"1\" *-- \"many\" Task\n@enduml", selection: "Project" },
    { id: "usecase", source: "@startuml\nleft to right direction\nactor User\nrectangle System {\n  usecase \"Create project\" as Create\n  usecase \"View project\" as View\n}\nUser --> Create\nUser --> View\n@enduml", selection: "Create project" },
    { id: "component", source: "@startuml\n[Web app] --> [API]\n[API] --> [Service]\ndatabase Database\n[Service] --> Database\n@enduml", selection: "Web app" },
    { id: "deployment", source: "@startuml\nnode Client {\n  artifact Browser\n}\nnode Server {\n  component API\n}\ndatabase Database\nBrowser --> API : HTTPS\nAPI --> Database\n@enduml", selection: "Client" },
    { id: "state", source: "@startuml\n[*] --> Pending\nPending --> Active : Start\nActive --> Complete : Finish\nComplete --> [*]\n@enduml", selection: "Pending" },
    { id: "object", source: "@startuml\nobject project {\n  name = Demo\n}\nobject task {\n  title = Review\n  done = false\n}\nproject o-- task\n@enduml", selection: "Demo" },
    { id: "mindmap", source: "@startmindmap\n* Project\n** Planning\n*** Goals\n*** Schedule\n** Delivery\n*** Build\n*** Review\n@endmindmap", selection: "Project" },
    { id: "wbs", source: "@startwbs\n* Project\n** Planning\n*** Requirements\n*** Design\n** Delivery\n*** Development\n*** Testing\n@endwbs", selection: "Project" },
    { id: "gantt", source: "@startgantt\nProject starts 2026-01-01\n[Design] lasts 7 days\n[Build] lasts 14 days\n[Build] starts at [Design]'s end\n@endgantt", selection: "2026-01-01" },
  ],
};

export function diagramBlock(family: DiagramFamily, template: DiagramTemplate) {
  const opening = `\`\`\`${family}\n`;
  return {
    text: `${opening}${template.source}\n\`\`\``,
    selectionStart: opening.length + template.source.indexOf(template.selection),
    selectionLength: template.selection.length,
  };
}
