import { describe, it, expect } from 'vitest';
import { parseBpmnXml, getDefaultBpmnTemplate } from '@/lib/bpmn/bpmn-engine';

describe('BPMN Engine', () => {
  describe('parseBpmnXml', () => {
    it('parses a simple sequential process', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <bpmn:process id="Process_1" name="Test Process" isExecutable="true">
    <bpmn:startEvent id="StartEvent_1" name="Start">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_1" />
    <bpmn:userTask id="Task_1" name="Review">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_1" targetRef="EndEvent_1" />
    <bpmn:endEvent id="EndEvent_1" name="End">
      <bpmn:incoming>Flow_2</bpmn:incoming>
    </bpmn:endEvent>
  </bpmn:process>
</bpmn:definitions>`;

      const parsed = parseBpmnXml(xml);

      expect(parsed.startEvent).toBeDefined();
      expect(parsed.startEvent?.id).toBe('StartEvent_1');
      expect(parsed.startEvent?.name).toBe('Start');
      expect(parsed.endEvents).toHaveLength(1);
      expect(parsed.endEvents[0].id).toBe('EndEvent_1');
      expect(parsed.userTasks).toHaveLength(1);
      expect(parsed.userTasks[0].name).toBe('Review');
      expect(parsed.sequenceFlows).toHaveLength(2);
    });

    it('parses multiple user tasks', () => {
      const xml = `<?xml version="1.0"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:startEvent id="Start_1" name="Start">
      <bpmn:outgoing>F1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:sequenceFlow id="F1" sourceRef="Start_1" targetRef="T1" />
    <bpmn:userTask id="T1" name="Task 1">
      <bpmn:outgoing>F2</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:sequenceFlow id="F2" sourceRef="T1" targetRef="T2" />
    <bpmn:userTask id="T2" name="Task 2">
      <bpmn:outgoing>F3</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:sequenceFlow id="F3" sourceRef="T2" targetRef="T3" />
    <bpmn:userTask id="T3" name="Task 3">
      <bpmn:outgoing>F4</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:sequenceFlow id="F4" sourceRef="T3" targetRef="End_1" />
    <bpmn:endEvent id="End_1" name="End">
      <bpmn:incoming>F4</bpmn:incoming>
    </bpmn:endEvent>
  </bpmn:process>
</bpmn:definitions>`;

      const parsed = parseBpmnXml(xml);
      expect(parsed.userTasks).toHaveLength(3);
      expect(parsed.userTasks.map(t => t.name)).toEqual(['Task 1', 'Task 2', 'Task 3']);
    });

    it('parses exclusive gateways', () => {
      const xml = `<?xml version="1.0"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:startEvent id="S1" name="Start" />
    <bpmn:exclusiveGateway id="G1" name="Approved?" />
    <bpmn:endEvent id="E1" name="End" />
  </bpmn:process>
</bpmn:definitions>`;

      const parsed = parseBpmnXml(xml);
      expect(parsed.gateways).toHaveLength(1);
      expect(parsed.gateways[0].type).toBe('exclusiveGateway');
      expect(parsed.gateways[0].name).toBe('Approved?');
    });

    it('parses parallel gateways', () => {
      const xml = `<?xml version="1.0"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:parallelGateway id="PG1" name="Split" />
  </bpmn:process>
</bpmn:definitions>`;

      const parsed = parseBpmnXml(xml);
      expect(parsed.gateways).toHaveLength(1);
      expect(parsed.gateways[0].type).toBe('parallelGateway');
    });

    it('parses service tasks', () => {
      const xml = `<?xml version="1.0"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:serviceTask id="ST1" name="Send Email" />
  </bpmn:process>
</bpmn:definitions>`;

      const parsed = parseBpmnXml(xml);
      expect(parsed.serviceTasks).toHaveLength(1);
      expect(parsed.serviceTasks[0].name).toBe('Send Email');
    });

    it('handles empty XML gracefully', () => {
      const xml = '<?xml version="1.0"?><bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"></bpmn:definitions>';
      const parsed = parseBpmnXml(xml);
      expect(parsed.startEvent).toBeUndefined();
      expect(parsed.endEvents).toHaveLength(0);
      expect(parsed.userTasks).toHaveLength(0);
      expect(parsed.sequenceFlows).toHaveLength(0);
    });

    it('builds execution path from start to end', () => {
      const xml = `<?xml version="1.0"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:startEvent id="S1" name="Start">
      <bpmn:outgoing>F1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:sequenceFlow id="F1" sourceRef="S1" targetRef="T1" />
    <bpmn:userTask id="T1" name="Review">
      <bpmn:outgoing>F2</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:sequenceFlow id="F2" sourceRef="T1" targetRef="E1" />
    <bpmn:endEvent id="E1" name="End">
      <bpmn:incoming>F2</bpmn:incoming>
    </bpmn:endEvent>
  </bpmn:process>
</bpmn:definitions>`;

      const parsed = parseBpmnXml(xml);
      expect(parsed.executionPath.length).toBeGreaterThan(0);
      expect(parsed.executionPath[0].id).toBe('S1');
    });
  });

  describe('getDefaultBpmnTemplate', () => {
    it('generates valid XML with the given process key and name', () => {
      const xml = getDefaultBpmnTemplate('invoice_approval', 'Invoice Approval');
      expect(xml).toContain('id="invoice_approval"');
      expect(xml).toContain('name="Invoice Approval"');
      expect(xml).toContain('<bpmn:startEvent');
      expect(xml).toContain('<bpmn:endEvent');
      expect(xml).toContain('<bpmn:userTask');
      expect(xml).toContain('<bpmn:sequenceFlow');
    });

    it('includes BPMNDiagram for visual rendering', () => {
      const xml = getDefaultBpmnTemplate('test_process', 'Test');
      expect(xml).toContain('<bpmndi:BPMNDiagram');
      expect(xml).toContain('<bpmndi:BPMNShape');
      expect(xml).toContain('<bpmndi:BPMNEdge');
    });

    it('includes two user tasks by default (Review + Approve)', () => {
      const xml = getDefaultBpmnTemplate('test', 'Test');
      expect(xml).toContain('Review Document');
      expect(xml).toContain('Approve Document');
    });
  });
});
