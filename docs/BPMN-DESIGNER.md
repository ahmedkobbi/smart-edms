# BPMN Visual Workflow Designer

<div align="center">

**صُنع في الجزائر — يخدم العالم**
*Made in Algeria — built for the world.*

</div>

---

## Overview

Smart EDMS includes a **visual BPMN 2.0 workflow designer** powered by
[bpmn-js](https://bpmn.io/toolkit/bpmn-js/). Non-technical admins can
drag-and-drop process steps, gateways, and flows — the designer maps them
to the existing approval engine on publish.

## Features

### Visual modeling (bpmn-js)
- Drag-and-drop palette: start events, end events, user tasks, service tasks, gateways
- Property panel for element names and assignees
- Sequence flow connections between elements
- Standard BPMN 2.0 XML output (portable to other BPMN tools)

### Server-side parsing
- Custom regex-based XML parser (no DOM dependency)
- Extracts: start/end events, user tasks, service tasks, exclusive/parallel/inclusive gateways, sequence flows
- Builds execution path by following flows from start to end

### Engine mapping
On "publish", BPMN `userTask` elements are mapped to `WorkflowDefinition.steps`:
```json
{
  "name": "Review Document",
  "approverType": "user",
  "approverIds": ["user-cuid"],
  "mode": "all",
  "dueInHours": 72
}
```
The linked `WorkflowDefinition` is created/updated atomically.

### Versioning
- Each save creates a new version (auto-incremented per `processKey`)
- Full version history stored as JSON array
- Only published versions can start instances

### Instance management
- Start instances linked to documents
- Track execution state (current activity, variables, history)
- Terminate with reason (step-up auth)

## API Endpoints

| Method | Path | Permission | Purpose |
|--------|------|------------|---------|
| `GET` | `/api/bpmn/definitions` | `bpmn:design.view` | List definitions |
| `POST` | `/api/bpmn/definitions` | `bpmn:design.manage` | Save definition |
| `GET` | `/api/bpmn/definitions/:id` | `bpmn:design.view` | Get definition |
| `POST` | `/api/bpmn/definitions/:id/publish` | `bpmn:design.manage` | Publish (step-up) |
| `GET` | `/api/bpmn/definitions/:id/instances` | `bpmn:design.view` | List instances |
| `POST` | `/api/bpmn/definitions/:id/instances` | `bpmn:instance.manage` | Start instance |
| `POST` | `/api/bpmn/definitions/template` | `bpmn:design.view` | Get default XML template |

## UI

- **Admin → BPMN Designer** — definition list with version and status
- **Editor page** — full bpmn-js modeler with save/publish buttons
- Parsed elements summary (tasks, gateways, events count)

## Limitations

- Parallel gateway execution is parsed but not yet supported in the engine (sequential only)
- Gateway conditions must be edited in the XML (no visual condition editor)
- bpmn-js is ~500KB minified (loaded client-side only)

## See Also

- [ADR-019: BPMN Workflow Designer](./adr/019-bpmn-workflow-designer.md)
- Existing workflow engine: `src/lib/workflow/escalation.ts`
