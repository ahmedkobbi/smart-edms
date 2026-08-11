/**
 * Smart EDMS — BPMN Visual Workflow Designer Engine
 *
 * Parses BPMN 2.0 XML and maps it to the existing Workflow/Approval engine.
 * The visual designer uses bpmn-js (client-side) to create/edit diagrams;
 * this library handles server-side parsing, validation, and execution mapping.
 *
 * Architecture:
 *   1. User designs a BPMN diagram in the browser (bpmn-js)
 *   2. The XML is saved via /api/bpmn/definitions POST
 *   3. This library parses the XML into structured elements
 *   4. On "publish", the parsed elements are mapped to a WorkflowDefinition
 *      (converting BPMN userTasks → approval steps)
 *   5. When a document triggers the process, a BpmnProcessInstance is created
 *      and linked to a Workflow for execution
 */

import { db } from '@/lib/db';
import { logger } from '@/lib/config/logger';
import { recordAuditEvent } from '@/lib/audit/audit-service';

// ============================================================================
// TYPES
// ============================================================================

export type BpmnStatus = 'draft' | 'published' | 'deprecated' | 'archived';
export type InstanceStatus = 'running' | 'completed' | 'terminated' | 'errored' | 'suspended';

export interface BpmnElement {
  id: string;
  name: string;
  type: BpmnElementType;
  // For user tasks: who approves
  assignee?: string;
  candidateGroups?: string[];
  // For gateways: the condition
  condition?: string;
  // For sequence flows: source and target
  sourceRef?: string;
  targetRef?: string;
}

export type BpmnElementType =
  | 'startEvent'
  | 'endEvent'
  | 'userTask'
  | 'serviceTask'
  | 'exclusiveGateway'
  | 'parallelGateway'
  | 'inclusiveGateway'
  | 'sequenceFlow'
  | 'callActivity'
  | 'scriptTask';

export interface ParsedBpmn {
  startEvent?: BpmnElement;
  endEvents: BpmnElement[];
  userTasks: BpmnElement[];
  serviceTasks: BpmnElement[];
  gateways: BpmnElement[];
  sequenceFlows: BpmnElement[];
  // The linear execution path (for simple sequential workflows)
  executionPath: BpmnElement[];
}

export interface SaveDefinitionInput {
  tenantId: string;
  processKey: string;
  name: string;
  description?: string;
  bpmnXml: string;
  createdBy: string;
}

// ============================================================================
// BPMN XML PARSING
// ============================================================================

/**
 * Parse BPMN 2.0 XML into structured elements.
 * Uses a lightweight XML parser (no external dependency — uses DOMParser in browser
 * or regex-based parsing on the server for simplicity).
 */
export function parseBpmnXml(xml: string): ParsedBpmn {
  const elements: BpmnElement[] = [];

  // Helper: extract an attribute value from an XML tag
  function extractAttr(tag: string, attr: string): string | undefined {
    const re = new RegExp(`\\s${attr}="([^"]*)"`, 'i');
    const m = tag.match(re);
    return m ? m[1] : undefined;
  }

  // Match all BPMN element opening tags and extract their type, id, and name
  const elementRegex = /<bpmn:(startEvent|endEvent|userTask|serviceTask|exclusiveGateway|parallelGateway|inclusiveGateway|scriptTask|callActivity)\b([^>]*)>/g;
  let match;
  while ((match = elementRegex.exec(xml)) !== null) {
    const tagName = match[1];
    const attrs = match[2];
    const id = extractAttr(attrs, 'id') || '';
    const name = extractAttr(attrs, 'name') || '';
    const element: BpmnElement = { id, name, type: tagName as BpmnElementType };

    // Extract assignee for user tasks (from extension elements or attributes)
    if (tagName === 'userTask') {
      const assigneeMatch = xml.match(
        new RegExp(`<bpmn:userTask[^>]*id="${id}"[^>]*>[\\s\\S]*?<bpmn:extensionElements>[\\s\\S]*?camunda:assignee>([^<]+)`)
      );
      if (assigneeMatch) element.assignee = assigneeMatch[1];

      const candidateMatch = xml.match(
        new RegExp(`<bpmn:userTask[^>]*id="${id}"[^>]*>[\\s\\S]*?<bpmn:extensionElements>[\\s\\S]*?camunda:candidateGroups>([^<]+)`)
      );
      if (candidateMatch) element.candidateGroups = candidateMatch[1].split(',');
    }

    elements.push(element);
  }

  // Extract sequence flows
  const flowRegex = /<bpmn:sequenceFlow\b([^>]*)>/g;
  let flowMatch;
  while ((flowMatch = flowRegex.exec(xml)) !== null) {
    const attrs = flowMatch[1];
    const id = extractAttr(attrs, 'id') || '';
    const name = extractAttr(attrs, 'name') || '';
    const sourceRef = extractAttr(attrs, 'sourceRef');
    const targetRef = extractAttr(attrs, 'targetRef');
    elements.push({ id, name, type: 'sequenceFlow', sourceRef, targetRef });
  }

  // Categorize elements
  const startEvent = elements.find(e => e.type === 'startEvent');
  const endEvents = elements.filter(e => e.type === 'endEvent');
  const userTasks = elements.filter(e => e.type === 'userTask');
  const serviceTasks = elements.filter(e => e.type === 'serviceTask');
  const gateways = elements.filter(e =>
    e.type === 'exclusiveGateway' || e.type === 'parallelGateway' || e.type === 'inclusiveGateway'
  );
  const sequenceFlows = elements.filter(e => e.type === 'sequenceFlow');

  // Build execution path (simple linear: start → userTasks in order → end)
  const executionPath: BpmnElement[] = [];
  if (startEvent) executionPath.push(startEvent);

  // Follow the sequence flows from start to end
  if (startEvent) {
    let currentId = startEvent.id;
    const visited = new Set<string>([startEvent.id]);

    while (true) {
      // Find the next flow from the current element
      const nextFlow = sequenceFlows.find(f => f.sourceRef === currentId && !visited.has(f.targetRef!));
      if (!nextFlow || !nextFlow.targetRef) break;

      const nextElement = elements.find(e => e.id === nextFlow.targetRef);
      if (!nextElement) break;

      if (nextElement.type === 'userTask') executionPath.push(nextElement);
      visited.add(nextElement.id);
      currentId = nextElement.id;

      if (nextElement.type === 'endEvent') break;
    }
  }

  executionPath.push(...endEvents);

  return {
    startEvent,
    endEvents,
    userTasks,
    serviceTasks,
    gateways,
    sequenceFlows,
    executionPath,
  };
}

// ============================================================================
// DEFINITION MANAGEMENT
// ============================================================================

export async function saveBpmnDefinition(input: SaveDefinitionInput) {
  const parsed = parseBpmnXml(input.bpmnXml);

  // Check if a definition with this key already exists
  const existing = await db.bpmnProcessDefinition.findFirst({
    where: { tenantId: input.tenantId, processKey: input.processKey },
    orderBy: { version: 'desc' },
  });

  const version = existing ? existing.version + 1 : 1;

  const definition = await db.bpmnProcessDefinition.create({
    data: {
      tenantId: input.tenantId,
      processKey: input.processKey,
      name: input.name,
      description: input.description,
      version,
      bpmnXml: input.bpmnXml,
      parsedElements: JSON.stringify(parsed) as any,
      status: 'draft',
      createdBy: input.createdBy,
      lastModifiedBy: input.createdBy,
      versionHistory: JSON.stringify([{
        version,
        modifiedBy: input.createdBy,
        modifiedAt: new Date().toISOString(),
        changeLog: 'Initial creation',
      }]),
    },
  });

  await recordAuditEvent({
    tenantId: input.tenantId,
    eventType: 'bpmn.definition.saved',
    action: 'create',
    resourceType: 'bpmn_definition',
    resourceId: definition.id,
    resourceName: definition.name,
    metadata: { processKey: input.processKey, version },
  });

  logger.info('BPMN definition saved', { definitionId: definition.id, processKey: input.processKey, version });
  return definition;
}

export async function publishBpmnDefinition(definitionId: string, tenantId: string, publishedBy: string) {
  const definition = await db.bpmnProcessDefinition.findFirst({
    where: { id: definitionId, tenantId },
  });
  if (!definition) throw new Error('Definition not found');

  const parsed: ParsedBpmn = JSON.parse(definition.parsedElements);

  // Map BPMN user tasks to workflow steps
  const steps = parsed.userTasks.map((task, index) => ({
    name: task.name || `Step ${index + 1}`,
    approverType: 'user',
    approverIds: task.assignee ? [task.assignee] : [],
    mode: 'all',
    dueInHours: 72,
    escalatesTo: undefined,
  }));

  // Create or update the linked WorkflowDefinition
  let workflowDefinitionId = definition.workflowDefinitionId;

  if (steps.length > 0 && !workflowDefinitionId) {
    const wfDef = await db.workflowDefinition.create({
      data: {
        tenantId,
        name: definition.name,
        description: definition.description,
        steps: JSON.stringify(steps),
        triggerEvent: 'manual',
        enabled: true,
      },
    });
    workflowDefinitionId = wfDef.id;
  } else if (steps.length > 0 && workflowDefinitionId) {
    await db.workflowDefinition.update({
      where: { id: workflowDefinitionId },
      data: { steps: JSON.stringify(steps), name: definition.name, description: definition.description },
    });
  }

  const updated = await db.bpmnProcessDefinition.update({
    where: { id: definitionId },
    data: {
      status: 'published',
      publishedAt: new Date(),
      lastModifiedBy: publishedBy,
      workflowDefinitionId,
    },
  });

  await recordAuditEvent({
    tenantId,
    eventType: 'bpmn.definition.published',
    action: 'update',
    resourceType: 'bpmn_definition',
    resourceId: definitionId,
    metadata: { version: definition.version, workflowDefinitionId },
  });

  logger.info('BPMN definition published', { definitionId, workflowDefinitionId });
  return updated;
}

export async function getBpmnDefinition(definitionId: string, tenantId: string) {
  const definition = await db.bpmnProcessDefinition.findFirst({
    where: { id: definitionId, tenantId },
    include: {
      instances: { orderBy: { startedAt: 'desc' }, take: 10 },
    },
  });
  if (!definition) return null;

  return {
    ...definition,
    parsedElements: JSON.parse(definition.parsedElements),
    versionHistory: JSON.parse(definition.versionHistory),
  };
}

export async function listBpmnDefinitions(tenantId: string, status?: BpmnStatus) {
  const where: Record<string, unknown> = { tenantId };
  if (status) where.status = status;

  // Get only the latest version of each processKey
  const all = await db.bpmnProcessDefinition.findMany({
    where,
    orderBy: [{ processKey: 'asc' }, { version: 'desc' }],
    select: {
      id: true,
      processKey: true,
      name: true,
      description: true,
      version: true,
      status: true,
      publishedAt: true,
      createdAt: true,
      updatedAt: true,
      createdBy: true,
      _count: { select: { instances: true } },
    },
  });

  // Deduplicate: keep only the latest version per processKey
  const seen = new Set<string>();
  return all.filter(d => {
    if (seen.has(d.processKey)) return false;
    seen.add(d.processKey);
    return true;
  });
}

// ============================================================================
// INSTANCE MANAGEMENT
// ============================================================================

export async function startBpmnInstance(
  definitionId: string,
  tenantId: string,
  documentId: string | undefined,
  initiatedBy: string,
) {
  const definition = await db.bpmnProcessDefinition.findFirst({
    where: { id: definitionId, tenantId, status: 'published' },
  });
  if (!definition) throw new Error('Published definition not found');

  const parsed: ParsedBpmn = JSON.parse(definition.parsedElements);
  const startEvent = parsed.startEvent;

  const instance = await db.bpmnProcessInstance.create({
    data: {
      tenantId,
      definitionId,
      documentId: documentId || null,
      status: 'running',
      currentActivityId: startEvent?.id || null,
      executionState: JSON.stringify({
        variables: {},
        history: [{
          activityId: startEvent?.id,
          activityName: startEvent?.name,
          enteredAt: new Date().toISOString(),
          actorId: initiatedBy,
        }],
      }),
      initiatedBy,
    },
  });

  // If linked to a WorkflowDefinition, create a Workflow
  if (definition.workflowDefinitionId && documentId) {
    const workflow = await db.workflow.create({
      data: {
        tenantId,
        definitionId: definition.workflowDefinitionId,
        documentId,
        initiatedById: initiatedBy,
        name: definition.name,
        status: 'pending',
        currentStep: 0,
        dueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days default
      },
    });

    // Update the instance with the workflow link
    await db.bpmnProcessInstance.update({
      where: { id: instance.id },
      data: {
        executionState: JSON.stringify({
          variables: { workflowId: workflow.id },
          history: [{
            activityId: startEvent?.id,
            activityName: startEvent?.name,
            enteredAt: new Date().toISOString(),
            actorId: initiatedBy,
          }],
        }),
      },
    });
  }

  await recordAuditEvent({
    tenantId,
    eventType: 'bpmn.instance.started',
    action: 'create',
    resourceType: 'bpmn_instance',
    resourceId: instance.id,
    metadata: { definitionId, documentId },
  });

  logger.info('BPMN instance started', { instanceId: instance.id, definitionId });
  return instance;
}

export async function terminateBpmnInstance(
  instanceId: string,
  tenantId: string,
  terminatedBy: string,
  reason: string,
) {
  const instance = await db.bpmnProcessInstance.update({
    where: { id: instanceId },
    data: {
      status: 'terminated',
      terminatedAt: new Date(),
      terminatedBy,
      terminatedReason: reason,
    },
  });

  await recordAuditEvent({
    tenantId,
    eventType: 'bpmn.instance.terminated',
    action: 'update',
    resourceType: 'bpmn_instance',
    resourceId: instanceId,
    metadata: { reason, terminatedBy },
  });

  return instance;
}

// ============================================================================
// BPMN XML TEMPLATE (for new diagrams)
// ============================================================================

export function getDefaultBpmnTemplate(processKey: string, name: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                 xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                 xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                 xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
                 xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
                 id="Definitions_${processKey}"
                 targetNamespace="http://smartedms.local/bpmn">
  <bpmn:process id="${processKey}" name="${name}" isExecutable="true">
    <bpmn:startEvent id="StartEvent_1" name="Start">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_1" />
    <bpmn:userTask id="Task_1" name="Review Document">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_1" targetRef="Task_2" />
    <bpmn:userTask id="Task_2" name="Approve Document">
      <bpmn:incoming>Flow_2</bpmn:incoming>
      <bpmn:outgoing>Flow_3</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:sequenceFlow id="Flow_3" sourceRef="Task_2" targetRef="EndEvent_1" />
    <bpmn:endEvent id="EndEvent_1" name="End">
      <bpmn:incoming>Flow_3</bpmn:incoming>
    </bpmn:endEvent>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="${processKey}">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Box x="152" y="82" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1">
        <dc:Box x="250" y="60" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_2_di" bpmnElement="Task_2">
        <dc:Box x="410" y="60" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1">
        <dc:Box x="572" y="82" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="188" y="100" />
        <di:waypoint x="250" y="100" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2">
        <di:waypoint x="350" y="100" />
        <di:waypoint x="410" y="100" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_3_di" bpmnElement="Flow_3">
        <di:waypoint x="510" y="100" />
        <di:waypoint x="572" y="100" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
}
