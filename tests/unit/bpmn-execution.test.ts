import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/db', () => ({
  db: {
    bpmnProcessInstance: {
      findFirst: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock('@/lib/audit/audit-service', () => ({
  recordAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/config/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import { getDefaultBpmnTemplate, parseBpmnXml } from '@/lib/bpmn/bpmn-engine';

describe('BPMN Engine — Instance Execution', () => {
  describe('Execution path construction', () => {
    it('builds a valid execution path for a two-step process', () => {
      const xml = getDefaultBpmnTemplate('test_process', 'Test Process');
      const parsed = parseBpmnXml(xml);

      // Should have start event, 2 user tasks, and end event in the path
      expect(parsed.executionPath.length).toBeGreaterThan(0);
      expect(parsed.executionPath[0].type).toBe('startEvent');

      // Should include at least 2 user tasks
      const userTasksInPath = parsed.executionPath.filter(e => e.type === 'userTask');
      expect(userTasksInPath.length).toBeGreaterThanOrEqual(2);
    });

    it('execution path ends with endEvent', () => {
      const xml = getDefaultBpmnTemplate('test_process', 'Test Process');
      const parsed = parseBpmnXml(xml);

      const lastElement = parsed.executionPath[parsed.executionPath.length - 1];
      expect(lastElement.type).toBe('endEvent');
    });

    it('user tasks in execution path have names', () => {
      const xml = getDefaultBpmnTemplate('test_process', 'Test Process');
      const parsed = parseBpmnXml(xml);

      const userTasksInPath = parsed.executionPath.filter(e => e.type === 'userTask');
      for (const task of userTasksInPath) {
        expect(task.name).toBeTruthy();
      }
    });
  });
});
