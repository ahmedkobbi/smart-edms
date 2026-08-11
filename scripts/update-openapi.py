#!/usr/bin/env python3
"""Merge new feature endpoints into docs/openapi.json."""

import json

with open('docs/openapi.json', 'r') as f:
    spec = json.load(f)

if 'paths' not in spec:
    spec['paths'] = {}
if 'components' not in spec:
    spec['components'] = {}
if 'schemas' not in spec['components']:
    spec['components']['schemas'] = {}

def err(*codes):
    """Standard error responses."""
    r = {}
    m = {
        '400': 'Bad request',
        '401': 'Authentication required',
        '403': 'Insufficient permissions',
        '404': 'Resource not found',
        '409': 'State conflict',
        '429': 'Rate limit exceeded',
    }
    for c in codes:
        if c in m:
            r[c] = {'description': m[c]}
    return r

# Build all new paths as a dict
new_paths = {}

# ============================================================================
# SECURITY AUDIT
# ============================================================================
new_paths['/api/security-audit'] = {
    'get': {
        'tags': ['Security Audit'],
        'summary': 'List security audits',
        'security': [{'sessionAuth': []}],
        'parameters': [
            {'name': 'status', 'in': 'query', 'schema': {'type': 'string'}},
            {'name': 'framework', 'in': 'query', 'schema': {'type': 'string'}},
        ],
        'responses': {'200': {'description': 'List of audits'}, **err('401', '403', '429')},
    },
    'post': {
        'tags': ['Security Audit'],
        'summary': 'Create a security audit',
        'security': [{'sessionAuth': []}],
        'requestBody': {
            'required': True,
            'content': {'application/json': {'schema': {'$ref': '#/components/schemas/CreateSecurityAuditInput'}}},
        },
        'responses': {'201': {'description': 'Audit created'}, **err('400', '401', '403', '429')},
    },
}

new_paths['/api/security-audit/{id}'] = {
    'get': {
        'tags': ['Security Audit'],
        'summary': 'Get audit with findings',
        'security': [{'sessionAuth': []}],
        'parameters': [
            {'name': 'id', 'in': 'path', 'required': True, 'schema': {'type': 'string'}},
            {'name': 'format', 'in': 'query', 'schema': {'type': 'string', 'enum': ['report']}},
        ],
        'responses': {'200': {'description': 'Audit detail'}, **err('401', '403', '404')},
    },
    'patch': {
        'tags': ['Security Audit'],
        'summary': 'Update audit',
        'security': [{'sessionAuth': []}],
        'parameters': [{'name': 'id', 'in': 'path', 'required': True, 'schema': {'type': 'string'}}],
        'requestBody': {'required': True, 'content': {'application/json': {'schema': {'type': 'object'}}}},
        'responses': {'200': {'description': 'Audit updated'}, **err('400', '401', '403', '404')},
    },
}

new_paths['/api/security-audit/{id}/findings'] = {
    'get': {
        'tags': ['Security Audit'],
        'summary': 'List audit findings',
        'security': [{'sessionAuth': []}],
        'parameters': [{'name': 'id', 'in': 'path', 'required': True, 'schema': {'type': 'string'}}],
        'responses': {'200': {'description': 'List of findings'}, **err('401', '403', '404')},
    },
    'post': {
        'tags': ['Security Audit'],
        'summary': 'Create a finding',
        'security': [{'sessionAuth': []}],
        'parameters': [{'name': 'id', 'in': 'path', 'required': True, 'schema': {'type': 'string'}}],
        'requestBody': {'required': True, 'content': {'application/json': {'schema': {'$ref': '#/components/schemas/CreateFindingInput'}}}},
        'responses': {'201': {'description': 'Finding created'}, **err('400', '401', '403', '429')},
    },
}

new_paths['/api/security-audit/{id}/findings/{findingId}'] = {
    'get': {
        'tags': ['Security Audit'],
        'summary': 'Get finding details',
        'security': [{'sessionAuth': []}],
        'parameters': [
            {'name': 'id', 'in': 'path', 'required': True, 'schema': {'type': 'string'}},
            {'name': 'findingId', 'in': 'path', 'required': True, 'schema': {'type': 'string'}},
        ],
        'responses': {**err('401', '403', '404')},
    },
    'patch': {
        'tags': ['Security Audit'],
        'summary': 'Update/remediate a finding',
        'security': [{'sessionAuth': []}],
        'parameters': [
            {'name': 'id', 'in': 'path', 'required': True, 'schema': {'type': 'string'}},
            {'name': 'findingId', 'in': 'path', 'required': True, 'schema': {'type': 'string'}},
        ],
        'requestBody': {'required': True, 'content': {'application/json': {'schema': {'type': 'object'}}}},
        'responses': {'200': {'description': 'Finding updated'}, **err('400', '401', '403', '404')},
    },
}

new_paths['/api/security-audit/scan'] = {
    'get': {
        'tags': ['Security Audit'],
        'summary': 'List scan results',
        'security': [{'sessionAuth': []}],
        'responses': {**err('401', '403')},
    },
    'post': {
        'tags': ['Security Audit'],
        'summary': 'Run automated security scan',
        'description': 'Runs: npm-audit (dependency vulns), secret detection, config validation.',
        'security': [{'sessionAuth': []}],
        'requestBody': {
            'required': True,
            'content': {'application/json': {'schema': {'type': 'object', 'properties': {'scanType': {'type': 'string', 'enum': ['full', 'dependency', 'secret', 'config']}, 'auditId': {'type': 'string'}}}}},
        },
        'responses': {'201': {'description': 'Scan completed'}, **err('401', '403', '429')},
    },
}

new_paths['/api/security-audit/{id}/evidence'] = {
    'post': {
        'tags': ['Security Audit'],
        'summary': 'Collect evidence',
        'security': [{'sessionAuth': []}],
        'parameters': [{'name': 'id', 'in': 'path', 'required': True, 'schema': {'type': 'string'}}],
        'responses': {'201': {'description': 'Evidence collected'}, **err('401', '403', '404', '429')},
    },
    'get': {
        'tags': ['Security Audit'],
        'summary': 'Download evidence bundle',
        'security': [{'sessionAuth': []}],
        'parameters': [{'name': 'id', 'in': 'path', 'required': True, 'schema': {'type': 'string'}}],
        'responses': {'200': {'description': 'JSON download'}, **err('401', '403', '404')},
    },
}

# ============================================================================
# E-SIGNATURE
# ============================================================================
new_paths['/api/signatures'] = {
    'get': {
        'tags': ['E-Signature'],
        'summary': 'List signature requests',
        'security': [{'sessionAuth': []}],
        'parameters': [
            {'name': 'status', 'in': 'query', 'schema': {'type': 'string'}},
            {'name': 'documentId', 'in': 'query', 'schema': {'type': 'string'}},
        ],
        'responses': {**err('401', '403')},
    },
    'post': {
        'tags': ['E-Signature'],
        'summary': 'Create signature request',
        'description': 'DocuSign, Adobe Sign, or internal provider (auto-detected).',
        'security': [{'sessionAuth': []}],
        'requestBody': {
            'required': True,
            'content': {'application/json': {'schema': {'$ref': '#/components/schemas/CreateSignatureRequestInput'}}},
        },
        'responses': {'201': {'description': 'Request created'}, **err('400', '401', '403', '429')},
    },
}

new_paths['/api/signatures/{id}'] = {
    'get': {
        'tags': ['E-Signature'],
        'summary': 'Get signature request',
        'security': [{'sessionAuth': []}],
        'parameters': [{'name': 'id', 'in': 'path', 'required': True, 'schema': {'type': 'string'}}],
        'responses': {**err('401', '403', '404')},
    },
}

new_paths['/api/signatures/{id}/void'] = {
    'post': {
        'tags': ['E-Signature'],
        'summary': 'Void signature request (step-up auth)',
        'security': [{'sessionAuth': []}],
        'parameters': [{'name': 'id', 'in': 'path', 'required': True, 'schema': {'type': 'string'}}],
        'requestBody': {'required': True, 'content': {'application/json': {'schema': {'type': 'object', 'properties': {'reason': {'type': 'string'}}, 'required': ['reason']}}}},
        'responses': {**err('401', '403', '404', '409')},
    },
}

new_paths['/api/signatures/{id}/sign'] = {
    'post': {
        'tags': ['E-Signature'],
        'summary': 'Sign document (internal provider)',
        'description': 'Records electronic signature with SHA-256 attestation hash.',
        'security': [{'sessionAuth': []}],
        'parameters': [{'name': 'id', 'in': 'path', 'required': True, 'schema': {'type': 'string'}}],
        'requestBody': {'required': True, 'content': {'application/json': {'schema': {'type': 'object', 'properties': {'email': {'type': 'string', 'format': 'email'}, 'signatureText': {'type': 'string'}}, 'required': ['email', 'signatureText']}}}},
        'responses': {'200': {'description': 'Document signed'}, **err('400', '401', '403', '404', '409', '429')},
    },
}

new_paths['/api/signatures/{id}/signing-url'] = {
    'post': {
        'tags': ['E-Signature'],
        'summary': 'Get signing URL for a recipient',
        'security': [{'sessionAuth': []}],
        'parameters': [{'name': 'id', 'in': 'path', 'required': True, 'schema': {'type': 'string'}}],
        'requestBody': {'required': True, 'content': {'application/json': {'schema': {'type': 'object', 'properties': {'email': {'type': 'string', 'format': 'email'}}, 'required': ['email']}}}},
        'responses': {**err('401', '403', '404')},
    },
}

new_paths['/api/signatures/webhooks/docusign'] = {
    'post': {
        'tags': ['E-Signature', 'Webhooks'],
        'summary': 'DocuSign webhook (HMAC verified)',
        'security': [],
        'requestBody': {'required': True, 'content': {'application/json': {'schema': {'type': 'object'}}}},
        'responses': {'200': {'description': 'Received'}, '401': {'description': 'Invalid signature'}},
    },
}

new_paths['/api/signatures/webhooks/adobe-sign'] = {
    'post': {
        'tags': ['E-Signature', 'Webhooks'],
        'summary': 'Adobe Sign webhook (HMAC verified)',
        'security': [],
        'requestBody': {'required': True, 'content': {'application/json': {'schema': {'type': 'object'}}}},
        'responses': {'200': {'description': 'Received'}, '401': {'description': 'Invalid signature'}},
    },
}

# ============================================================================
# BPMN DESIGNER
# ============================================================================
new_paths['/api/bpmn/definitions'] = {
    'get': {
        'tags': ['BPMN Designer'],
        'summary': 'List BPMN definitions',
        'security': [{'sessionAuth': []}],
        'parameters': [{'name': 'status', 'in': 'query', 'schema': {'type': 'string', 'enum': ['draft', 'published', 'deprecated', 'archived']}}],
        'responses': {**err('401', '403')},
    },
    'post': {
        'tags': ['BPMN Designer'],
        'summary': 'Save BPMN definition (new version)',
        'security': [{'sessionAuth': []}],
        'requestBody': {
            'required': True,
            'content': {'application/json': {'schema': {'$ref': '#/components/schemas/SaveBpmnDefinitionInput'}}},
        },
        'responses': {'201': {'description': 'Definition saved'}, **err('400', '401', '403', '429')},
    },
}

new_paths['/api/bpmn/definitions/{id}'] = {
    'get': {
        'tags': ['BPMN Designer'],
        'summary': 'Get BPMN definition',
        'security': [{'sessionAuth': []}],
        'parameters': [{'name': 'id', 'in': 'path', 'required': True, 'schema': {'type': 'string'}}],
        'responses': {**err('401', '403', '404')},
    },
}

new_paths['/api/bpmn/definitions/{id}/publish'] = {
    'post': {
        'tags': ['BPMN Designer'],
        'summary': 'Publish BPMN definition (step-up auth)',
        'description': 'Maps userTask elements to WorkflowDefinition approval steps.',
        'security': [{'sessionAuth': []}],
        'parameters': [{'name': 'id', 'in': 'path', 'required': True, 'schema': {'type': 'string'}}],
        'responses': {**err('401', '403', '404')},
    },
}

new_paths['/api/bpmn/definitions/{id}/instances'] = {
    'get': {
        'tags': ['BPMN Designer'],
        'summary': 'List BPMN instances',
        'security': [{'sessionAuth': []}],
        'parameters': [{'name': 'id', 'in': 'path', 'required': True, 'schema': {'type': 'string'}}],
        'responses': {**err('401', '403', '404')},
    },
    'post': {
        'tags': ['BPMN Designer'],
        'summary': 'Start BPMN instance',
        'security': [{'sessionAuth': []}],
        'parameters': [{'name': 'id', 'in': 'path', 'required': True, 'schema': {'type': 'string'}}],
        'requestBody': {'content': {'application/json': {'schema': {'type': 'object', 'properties': {'documentId': {'type': 'string'}}}}}},
        'responses': {'201': {'description': 'Instance started'}, **err('401', '403', '404')},
    },
}

new_paths['/api/bpmn/definitions/template'] = {
    'post': {
        'tags': ['BPMN Designer'],
        'summary': 'Get default BPMN XML template',
        'security': [{'sessionAuth': []}],
        'requestBody': {'required': True, 'content': {'application/json': {'schema': {'type': 'object', 'properties': {'processKey': {'type': 'string'}, 'name': {'type': 'string'}}, 'required': ['processKey', 'name']}}}},
        'responses': {**err('401', '403')},
    },
}

new_paths['/api/bpmn/instances/{id}/advance'] = {
    'post': {
        'tags': ['BPMN Designer'],
        'summary': 'Advance BPMN instance (step-up auth)',
        'security': [{'sessionAuth': []}],
        'parameters': [{'name': 'id', 'in': 'path', 'required': True, 'schema': {'type': 'string'}}],
        'requestBody': {'required': True, 'content': {'application/json': {'schema': {'type': 'object', 'properties': {'outcome': {'type': 'string', 'enum': ['approved', 'rejected']}, 'comment': {'type': 'string'}}, 'required': ['outcome']}}}},
        'responses': {**err('401', '403', '404')},
    },
}

new_paths['/api/bpmn/instances/{id}/terminate'] = {
    'post': {
        'tags': ['BPMN Designer'],
        'summary': 'Terminate BPMN instance (step-up auth)',
        'security': [{'sessionAuth': []}],
        'parameters': [{'name': 'id', 'in': 'path', 'required': True, 'schema': {'type': 'string'}}],
        'requestBody': {'required': True, 'content': {'application/json': {'schema': {'type': 'object', 'properties': {'reason': {'type': 'string'}}, 'required': ['reason']}}}},
        'responses': {**err('401', '403', '404')},
    },
}

# ============================================================================
# RECORDS MANAGEMENT (DoD 5015.02)
# ============================================================================
new_paths['/api/records/categories'] = {
    'get': {'tags': ['Records Management'], 'summary': 'List record categories', 'security': [{'sessionAuth': []}], 'responses': {**err('401', '403')}},
    'post': {'tags': ['Records Management'], 'summary': 'Create record category', 'security': [{'sessionAuth': []}], 'requestBody': {'required': True, 'content': {'application/json': {'schema': {'$ref': '#/components/schemas/CreateRecordCategoryInput'}}}}, 'responses': {'201': {'description': 'Created'}, **err('400', '401', '403', '429')}},
}
new_paths['/api/records/categories/tree'] = {
    'get': {'tags': ['Records Management'], 'summary': 'Get category tree (hierarchical)', 'security': [{'sessionAuth': []}], 'responses': {**err('401', '403')}},
}
new_paths['/api/records/categories/{id}'] = {
    'get': {'tags': ['Records Management'], 'summary': 'Get category', 'security': [{'sessionAuth': []}], 'parameters': [{'name': 'id', 'in': 'path', 'required': True, 'schema': {'type': 'string'}}], 'responses': {**err('401', '403', '404')}},
    'patch': {'tags': ['Records Management'], 'summary': 'Update category', 'security': [{'sessionAuth': []}], 'parameters': [{'name': 'id', 'in': 'path', 'required': True, 'schema': {'type': 'string'}}], 'requestBody': {'required': True, 'content': {'application/json': {'schema': {'type': 'object'}}}}, 'responses': {**err('400', '401', '403', '404')}},
    'delete': {'tags': ['Records Management'], 'summary': 'Delete category', 'security': [{'sessionAuth': []}], 'parameters': [{'name': 'id', 'in': 'path', 'required': True, 'schema': {'type': 'string'}}], 'responses': {**err('401', '403', '404')}},
}
new_paths['/api/records/folders'] = {
    'get': {'tags': ['Records Management'], 'summary': 'List record folders', 'security': [{'sessionAuth': []}], 'parameters': [{'name': 'status', 'in': 'query', 'schema': {'type': 'string'}}, {'name': 'categoryId', 'in': 'query', 'schema': {'type': 'string'}}], 'responses': {**err('401', '403')}},
    'post': {'tags': ['Records Management'], 'summary': 'Create record folder', 'security': [{'sessionAuth': []}], 'requestBody': {'required': True, 'content': {'application/json': {'schema': {'$ref': '#/components/schemas/CreateRecordFolderInput'}}}}, 'responses': {'201': {'description': 'Created'}, **err('400', '401', '403', '429')}},
}
new_paths['/api/records/folders/{id}'] = {
    'get': {'tags': ['Records Management'], 'summary': 'Get folder', 'security': [{'sessionAuth': []}], 'parameters': [{'name': 'id', 'in': 'path', 'required': True, 'schema': {'type': 'string'}}], 'responses': {**err('401', '403', '404')}},
    'patch': {'tags': ['Records Management'], 'summary': 'Update folder', 'security': [{'sessionAuth': []}], 'parameters': [{'name': 'id', 'in': 'path', 'required': True, 'schema': {'type': 'string'}}], 'requestBody': {'required': True, 'content': {'application/json': {'schema': {'type': 'object'}}}}, 'responses': {**err('400', '401', '403', '404')}},
}
new_paths['/api/records/folders/{id}/cutoff'] = {
    'post': {'tags': ['Records Management'], 'summary': 'Cutoff folder (step-up auth)', 'security': [{'sessionAuth': []}], 'parameters': [{'name': 'id', 'in': 'path', 'required': True, 'schema': {'type': 'string'}}], 'responses': {**err('401', '403', '404', '409')}},
}
new_paths['/api/records/folders/{id}/dispose'] = {
    'post': {'tags': ['Records Management'], 'summary': 'Dispose folder (step-up auth)', 'description': 'Blocked by legal hold.', 'security': [{'sessionAuth': []}], 'parameters': [{'name': 'id', 'in': 'path', 'required': True, 'schema': {'type': 'string'}}], 'requestBody': {'required': True, 'content': {'application/json': {'schema': {'type': 'object', 'properties': {'method': {'type': 'string', 'enum': ['destroyed', 'transferred']}, 'notes': {'type': 'string'}}, 'required': ['method']}}}}, 'responses': {**err('401', '403', '404', '409')}},
}
new_paths['/api/records/vital'] = {
    'get': {'tags': ['Records Management'], 'summary': 'List vital records', 'security': [{'sessionAuth': []}], 'responses': {**err('401', '403')}},
    'post': {'tags': ['Records Management'], 'summary': 'Designate vital record', 'security': [{'sessionAuth': []}], 'requestBody': {'required': True, 'content': {'application/json': {'schema': {'$ref': '#/components/schemas/DesignateVitalRecordInput'}}}}, 'responses': {'201': {'description': 'Designated'}, **err('400', '401', '403', '429')}},
}
new_paths['/api/records/vital/{id}'] = {
    'get': {'tags': ['Records Management'], 'summary': 'Get vital record', 'security': [{'sessionAuth': []}], 'parameters': [{'name': 'id', 'in': 'path', 'required': True, 'schema': {'type': 'string'}}], 'responses': {**err('401', '403', '404')}},
    'patch': {'tags': ['Records Management'], 'summary': 'Update vital record / verify backup', 'security': [{'sessionAuth': []}], 'parameters': [{'name': 'id', 'in': 'path', 'required': True, 'schema': {'type': 'string'}}], 'requestBody': {'content': {'application/json': {'schema': {'type': 'object', 'properties': {'verifyBackup': {'type': 'boolean'}}}}}}, 'responses': {**err('400', '401', '403', '404')}},
}
new_paths['/api/records/vital/due-review'] = {
    'get': {'tags': ['Records Management'], 'summary': 'List vital records due for review', 'security': [{'sessionAuth': []}], 'responses': {**err('401', '403')}},
}
new_paths['/api/records/authorities'] = {
    'get': {'tags': ['Records Management'], 'summary': 'List disposition authorities', 'security': [{'sessionAuth': []}], 'responses': {**err('401', '403')}},
    'post': {'tags': ['Records Management'], 'summary': 'Create disposition authority', 'security': [{'sessionAuth': []}], 'requestBody': {'required': True, 'content': {'application/json': {'schema': {'$ref': '#/components/schemas/CreateDispositionAuthorityInput'}}}}, 'responses': {'201': {'description': 'Created'}, **err('400', '401', '403', '429')}},
}
new_paths['/api/records/authorities/{id}'] = {
    'get': {'tags': ['Records Management'], 'summary': 'Get authority', 'security': [{'sessionAuth': []}], 'parameters': [{'name': 'id', 'in': 'path', 'required': True, 'schema': {'type': 'string'}}], 'responses': {**err('401', '403', '404')}},
    'patch': {'tags': ['Records Management'], 'summary': 'Update authority', 'security': [{'sessionAuth': []}], 'parameters': [{'name': 'id', 'in': 'path', 'required': True, 'schema': {'type': 'string'}}], 'requestBody': {'required': True, 'content': {'application/json': {'schema': {'type': 'object'}}}}, 'responses': {**err('400', '401', '403', '404')}},
    'delete': {'tags': ['Records Management'], 'summary': 'Retire authority (soft delete)', 'security': [{'sessionAuth': []}], 'parameters': [{'name': 'id', 'in': 'path', 'required': True, 'schema': {'type': 'string'}}], 'responses': {**err('401', '403', '404')}},
}
new_paths['/api/records/compliance-report'] = {
    'get': {'tags': ['Records Management'], 'summary': 'Get DoD 5015.02 compliance report', 'description': 'All 15 requirements (C2.1-C3.6) with implementation status.', 'security': [{'sessionAuth': []}], 'responses': {**err('401', '403')}},
}

# Document → Record Category
new_paths['/api/documents/{id}/record-category'] = {
    'get': {
        'tags': ['Records Management', 'Documents'],
        'summary': 'Get document record category assignment',
        'security': [{'sessionAuth': []}],
        'parameters': [{'name': 'id', 'in': 'path', 'required': True, 'schema': {'type': 'string'}}],
        'responses': {**err('401', '403', '404')},
    },
    'post': {
        'tags': ['Records Management', 'Documents'],
        'summary': 'Assign/remove record category',
        'security': [{'sessionAuth': []}],
        'parameters': [{'name': 'id', 'in': 'path', 'required': True, 'schema': {'type': 'string'}}],
        'requestBody': {'required': True, 'content': {'application/json': {'schema': {'type': 'object', 'properties': {'categoryId': {'type': 'string', 'nullable': True}}}}}},
        'responses': {'200': {'description': 'Assignment updated'}, **err('400', '401', '403', '404')},
    },
}

# ============================================================================
# SCHEMAS
# ============================================================================
schemas = spec['components']['schemas']

schemas['SecurityAudit'] = {
    'type': 'object',
    'properties': {
        'id': {'type': 'string'},
        'title': {'type': 'string'},
        'framework': {'type': 'string', 'enum': ['iso27001', 'soc2', 'gdpr', 'hipaa', 'dod501502', 'internal']},
        'scope': {'type': 'string'},
        'status': {'type': 'string'},
        'riskScore': {'type': 'integer', 'minimum': 0, 'maximum': 100},
        'totalFindings': {'type': 'integer'},
        'criticalCount': {'type': 'integer'},
        'highCount': {'type': 'integer'},
        'mediumCount': {'type': 'integer'},
        'lowCount': {'type': 'integer'},
        'remediatedCount': {'type': 'integer'},
    },
}

schemas['SecurityAuditFinding'] = {
    'type': 'object',
    'properties': {
        'id': {'type': 'string'},
        'findingId': {'type': 'string'},
        'title': {'type': 'string'},
        'description': {'type': 'string'},
        'severity': {'type': 'string', 'enum': ['critical', 'high', 'medium', 'low', 'informational']},
        'status': {'type': 'string', 'enum': ['open', 'in_remediation', 'remediated', 'accepted_risk', 'false_positive']},
        'cvssScore': {'type': 'number'},
        'cweId': {'type': 'string'},
        'affectedComponent': {'type': 'string'},
        'remediation': {'type': 'string'},
    },
}

schemas['CreateSecurityAuditInput'] = {
    'type': 'object',
    'properties': {
        'title': {'type': 'string', 'minLength': 3},
        'description': {'type': 'string'},
        'framework': {'type': 'string', 'enum': ['iso27001', 'soc2', 'gdpr', 'hipaa', 'dod501502', 'internal']},
        'scope': {'type': 'string', 'enum': ['full', 'auth', 'documents', 'billing', 'infrastructure', 'api']},
    },
    'required': ['title'],
}

schemas['CreateFindingInput'] = {
    'type': 'object',
    'properties': {
        'findingId': {'type': 'string'},
        'title': {'type': 'string'},
        'description': {'type': 'string'},
        'severity': {'type': 'string', 'enum': ['critical', 'high', 'medium', 'low', 'informational']},
        'cvssScore': {'type': 'number'},
        'cweId': {'type': 'string'},
        'affectedComponent': {'type': 'string'},
        'remediation': {'type': 'string'},
    },
    'required': ['findingId', 'title', 'description'],
}

schemas['SignatureRequest'] = {
    'type': 'object',
    'properties': {
        'id': {'type': 'string'},
        'documentId': {'type': 'string'},
        'provider': {'type': 'string', 'enum': ['docusign', 'adobe_sign', 'internal']},
        'status': {'type': 'string', 'enum': ['draft', 'sent', 'delivered', 'completed', 'declined', 'expired', 'voided']},
        'envelopeId': {'type': 'string'},
    },
}

schemas['CreateSignatureRequestInput'] = {
    'type': 'object',
    'properties': {
        'documentId': {'type': 'string'},
        'provider': {'type': 'string', 'enum': ['docusign', 'adobe_sign', 'internal']},
        'recipients': {'type': 'array', 'items': {'type': 'object', 'properties': {'email': {'type': 'string'}, 'name': {'type': 'string'}, 'role': {'type': 'string'}, 'routingOrder': {'type': 'integer'}}}},
        'emailConfig': {'type': 'object', 'properties': {'subject': {'type': 'string'}, 'message': {'type': 'string'}, 'expiryDays': {'type': 'integer'}, 'reminderDays': {'type': 'integer'}}},
    },
    'required': ['documentId', 'recipients', 'emailConfig'],
}

schemas['BpmnProcessDefinition'] = {
    'type': 'object',
    'properties': {
        'id': {'type': 'string'},
        'processKey': {'type': 'string'},
        'name': {'type': 'string'},
        'version': {'type': 'integer'},
        'status': {'type': 'string', 'enum': ['draft', 'published', 'deprecated', 'archived']},
    },
}

schemas['BpmnProcessInstance'] = {
    'type': 'object',
    'properties': {
        'id': {'type': 'string'},
        'definitionId': {'type': 'string'},
        'status': {'type': 'string', 'enum': ['running', 'completed', 'terminated', 'errored', 'suspended']},
        'currentActivityId': {'type': 'string'},
    },
}

schemas['SaveBpmnDefinitionInput'] = {
    'type': 'object',
    'properties': {
        'processKey': {'type': 'string'},
        'name': {'type': 'string'},
        'description': {'type': 'string'},
        'bpmnXml': {'type': 'string'},
    },
    'required': ['processKey', 'name', 'bpmnXml'],
}

schemas['CreateRecordCategoryInput'] = {
    'type': 'object',
    'properties': {
        'code': {'type': 'string'},
        'name': {'type': 'string'},
        'description': {'type': 'string'},
        'disposition': {'type': 'string', 'enum': ['permanent', 'temporary', 'unscheduled']},
        'retentionActiveYears': {'type': 'integer'},
        'retentionSemiActiveYears': {'type': 'integer'},
        'dispositionAction': {'type': 'string', 'enum': ['destroy', 'transfer_to_nara', 'transfer_to_agency']},
        'isVital': {'type': 'boolean'},
    },
    'required': ['code', 'name'],
}

schemas['CreateRecordFolderInput'] = {
    'type': 'object',
    'properties': {
        'categoryId': {'type': 'string'},
        'title': {'type': 'string'},
        'description': {'type': 'string'},
        'fiscalYear': {'type': 'string'},
    },
    'required': ['categoryId', 'title'],
}

schemas['DesignateVitalRecordInput'] = {
    'type': 'object',
    'properties': {
        'documentId': {'type': 'string'},
        'categoryId': {'type': 'string'},
        'vitalReason': {'type': 'string', 'enum': ['operational', 'legal', 'financial', 'historical']},
        'recordType': {'type': 'string', 'enum': ['essential', 'important', 'useful']},
        'recoveryPriority': {'type': 'integer', 'minimum': 1, 'maximum': 5},
        'reviewCycleMonths': {'type': 'integer', 'minimum': 1, 'maximum': 36},
        'notes': {'type': 'string'},
    },
    'required': ['documentId'],
}

schemas['CreateDispositionAuthorityInput'] = {
    'type': 'object',
    'properties': {
        'authorityType': {'type': 'string', 'enum': ['nara_grs', 'nara_sf', 'agency_specific', 'court_order']},
        'authorityNumber': {'type': 'string'},
        'title': {'type': 'string'},
        'description': {'type': 'string'},
        'retentionInstructions': {'type': 'object'},
        'effectiveDate': {'type': 'string', 'format': 'date-time'},
    },
    'required': ['authorityNumber', 'title'],
}

# ============================================================================
# MERGE + UPDATE METADATA
# ============================================================================
spec['paths'].update(new_paths)
spec['info']['version'] = '2.0.0'
spec['info']['description'] = 'Smart EDMS API — Enterprise-Grade SaaS Document Governance Platform with Security Audit, E-Signature, BPMN Designer, and DoD 5015.02 Records Management.'

with open('docs/openapi.json', 'w') as f:
    json.dump(spec, f, indent=2)

print(f'✅ OpenAPI spec updated:')
print(f'   Paths: {len(spec["paths"])} (was 46, added {len(new_paths)})')
print(f'   Schemas: {len(spec["components"]["schemas"])}')
print(f'   Version: {spec["info"]["version"]}')
