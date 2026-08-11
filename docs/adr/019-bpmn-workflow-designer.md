# ADR-019: Visual BPMN Workflow Designer

## Status

Accepted

## Date

2026-08-11

## Context

Smart EDMS already had a workflow/approval engine (`WorkflowDefinition` →
`Workflow` → `Approval` models) with multi-step sequential/parallel approvals,
delegation, escalation, and signature attestation. However, workflow definitions
were created via API calls or code — no visual designer existed.

Enterprise customers expect a **visual BPMN 2.0 designer** where non-technical
admins can drag-and-drop process steps, gateways, and flows without writing code.

## Decision

Implement a visual BPMN designer using **bpmn-js** (the standard open-source
BPMN 2.0 rendering and editing library from Camunda).

### 1. Client-side rendering
- `bpmn-js/lib/Modeler` for editing (drag-and-drop palette, property panel)
- `bpmn-js/dist/assets/*.css` for proper diagram styling
- Dynamic import (client-side only — bpmn-js touches `window`)

### 2. Server-side parsing
- Custom regex-based XML parser (no DOM dependency on the server)
- Extracts: start events, end events, user tasks, service tasks, gateways, sequence flows
- Builds a linear execution path by following sequence flows from start to end

### 3. Engine mapping
- On "publish", BPMN `userTask` elements are mapped to `WorkflowDefinition.steps`:
  ```json
  { "name": task.name, "approverType": "user", "approverIds": [task.assignee], "mode": "all", "dueInHours": 72 }
  ```
- The linked `WorkflowDefinition` is created/updated atomically
- `BpmnProcessInstance` links to `Workflow` for execution

### 4. Versioning
- Each save creates a new version (auto-incremented per `processKey`)
- Full version history stored as JSON array
- Only published versions can start instances

### 5. Template system
- `getDefaultBpmnTemplate()` generates a valid BPMN 2.0 XML with:
  - Start event → User Task (Review) → User Task (Approve) → End event
  - BPMNDiagram element with coordinates for visual rendering

## Consequences

### Positive
- Non-technical admins can design workflows visually
- Standard BPMN 2.0 XML is portable (can be exported to other BPMN tools)
- Versioning allows rollback to previous process definitions
- Maps cleanly to the existing approval engine (no separate execution engine)

### Negative
- bpmn-js is a large dependency (~500KB minified)
- Server-side parser uses regex (not a full XML parser — may fail on unusual XML)
- Only sequential execution is supported (parallel gateways parsed but not executed)
- No visual gateway condition editor (conditions must be in XML)

## Alternatives Considered

1. **Build a custom visual designer** — massive engineering effort, wouldn't match bpmn-js quality
2. **Use Camunda Platform** — too heavy (separate Java service), overkill for EDMS
3. **Keep code-only workflows** — doesn't meet enterprise expectations
