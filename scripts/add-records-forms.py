#!/usr/bin/env python3
"""Add create forms to the records management UI pages."""

import os

# Update the main records-management page to include a create category form
records_page = "src/app/(app)/admin/records-management/page.tsx"
with open(records_page, 'r') as f:
    content = f.read()

# Add useState and useMutation imports
content = content.replace(
    "import { useQuery } from '@tanstack/react-query';",
    "import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';"
)
content = content.replace(
    "import { Loader2, FolderTree, ShieldCheck, AlertCircle, FileCheck, Download } from 'lucide-react';",
    "import { Loader2, FolderTree, ShieldCheck, AlertCircle, FileCheck, Download, Plus } from 'lucide-react';"
)
content = content.replace(
    "import { useRouter } from 'next/navigation';",
    "import { useRouter } from 'next/navigation';\nimport { useState } from 'react';\nimport { useToast } from '@/hooks/use-toast';"
)

# Add the create form component and button before the categories list
content = content.replace(
    """      <div>
        <h2 className=\"text-lg font-semibold mb-3\">Record Categories</h2>""",
    """      {showCreate && <CreateCategoryForm onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); queryClient.invalidateQueries({ queryKey: ['record-categories'] }); queryClient.invalidateQueries({ queryKey: ['dod-compliance-report'] }); }} />}

      <div>
        <div className=\"flex items-center justify-between mb-3\">
          <h2 className=\"text-lg font-semibold\">Record Categories</h2>
          <Button size=\"sm\" onClick={() => setShowCreate(true)}><Plus className=\"h-4 w-4\" /> New Category</Button>
        </div>"""
)

# Add the state and queryClient hooks
content = content.replace(
    "export default function RecordsManagementPage() {\n  const { t } = useI18n();\n  const router = useRouter();",
    "export default function RecordsManagementPage() {\n  const { t } = useI18n();\n  const router = useRouter();\n  const queryClient = useQueryClient();\n  const { toast } = useToast();\n  const [showCreate, setShowCreate] = useState(false);"
)

# Add the CreateCategoryForm component at the end of the file
content += """

function CreateCategoryForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { toast } = useToast();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [disposition, setDisposition] = useState('temporary');
  const [retentionActiveYears, setRetentionActiveYears] = useState(3);
  const [isVital, setIsVital] = useState(false);

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/api/records/categories', data),
    onSuccess: () => { toast({ title: 'Category created' }); onCreated(); },
    onError: (err: any) => toast({ title: 'Failed', description: err?.message, variant: 'destructive' }),
  });

  return (
    <GlassCard className=\"p-6\">
      <h3 className=\"font-semibold mb-4\">Create Record Category</h3>
      <div className=\"space-y-4\">
        <div className=\"grid grid-cols-2 gap-4\">
          <input className=\"glass-input px-3 py-2 rounded-lg\" placeholder=\"Code (e.g., 1000)\" value={code} onChange={e => setCode(e.target.value)} />
          <input className=\"glass-input px-3 py-2 rounded-lg\" placeholder=\"Name\" value={name} onChange={e => setName(e.target.value)} />
        </div>
        <textarea className=\"glass-input w-full px-3 py-2 rounded-lg\" placeholder=\"Description (optional)\" rows={2} value={description} onChange={e => setDescription(e.target.value)} />
        <div className=\"grid grid-cols-2 gap-4\">
          <select className=\"glass-input px-3 py-2 rounded-lg\" value={disposition} onChange={e => setDisposition(e.target.value)}>
            <option value=\"temporary\">Temporary</option>
            <option value=\"permanent\">Permanent</option>
            <option value=\"unscheduled\">Unscheduled</option>
          </select>
          <div className=\"flex items-center gap-2\">
            <label className=\"text-sm whitespace-nowrap\">Active years:</label>
            <input type=\"number\" min=\"0\" className=\"glass-input w-20 px-3 py-2 rounded-lg\" value={retentionActiveYears} onChange={e => setRetentionActiveYears(Number(e.target.value))} />
          </div>
        </div>
        <label className=\"flex items-center gap-2 text-sm\">
          <input type=\"checkbox\" checked={isVital} onChange={e => setIsVital(e.target.checked)} />
          Designate as Vital Record category
        </label>
        <div className=\"flex gap-2 justify-end\">
          <Button variant=\"outline\" size=\"sm\" onClick={onClose}>Cancel</Button>
          <Button size=\"sm\" onClick={() => createMutation.mutate({ code, name, description, disposition, retentionActiveYears, isVital })} disabled={!code || !name || createMutation.isPending}>
            {createMutation.isPending ? <Loader2 className=\"h-4 w-4 animate-spin\" /> : 'Create'}
          </Button>
        </div>
      </div>
    </GlassCard>
  );
}
"""

with open(records_page, 'w') as f:
    f.write(content)
print(f"✅ Updated {records_page} with create category form")

# Update the folders page to include a create folder form
folders_page = "src/app/(app)/admin/records-management/folders/page.tsx"
with open(folders_page, 'r') as f:
    content = f.read()

content = content.replace(
    "import { Loader2, Folder, Scissors, Trash2, ArrowLeft } from 'lucide-react';",
    "import { Loader2, Folder, Scissors, Trash2, ArrowLeft, Plus } from 'lucide-react';"
)
content = content.replace(
    "import { useRouter } from 'next/navigation';",
    "import { useRouter } from 'next/navigation';\nimport { useState, useEffect } from 'react';"
)

# Add state and categories query
content = content.replace(
    "export default function FoldersPage() {\n  const { toast } = useToast();\n  const router = useRouter();\n  const queryClient = useQueryClient();",
    """export default function FoldersPage() {
  const { toast } = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const { data: categoriesData } = useQuery<any>({
    queryKey: ['record-categories'],
    queryFn: () => api.get('/api/records/categories'),
  });
  const categories = categoriesData?.items || [];"""
)

# Add the create button and form
content = content.replace(
    """      <div className=\"space-y-2\">
        {folders.length === 0 ? (""",
    """      {showCreate && <CreateFolderForm categories={categories} onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); queryClient.invalidateQueries({ queryKey: ['record-folders'] }); }} />}

      <div className=\"flex justify-end\">
        <Button size=\"sm\" onClick={() => setShowCreate(true)}><Plus className=\"h-4 w-4\" /> New Folder</Button>
      </div>

      <div className=\"space-y-2\">
        {folders.length === 0 ? ("""
)

# Add the CreateFolderForm at the end
content += """

function CreateFolderForm({ categories, onClose, onCreated }: { categories: any[]; onClose: () => void; onCreated: () => void }) {
  const { toast } = useToast();
  const [categoryId, setCategoryId] = useState(categories[0]?.id || '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [fiscalYear, setFiscalYear] = useState(String(new Date().getFullYear()));

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/api/records/folders', data),
    onSuccess: () => { toast({ title: 'Folder created' }); onCreated(); },
    onError: (err: any) => toast({ title: 'Failed', description: err?.message, variant: 'destructive' }),
  });

  return (
    <GlassCard className=\"p-6\">
      <h3 className=\"font-semibold mb-4\">Create Record Folder</h3>
      <div className=\"space-y-4\">
        <select className=\"glass-input w-full px-3 py-2 rounded-lg\" value={categoryId} onChange={e => setCategoryId(e.target.value)}>
          <option value=\"\">Select category...</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
        </select>
        <input className=\"glass-input w-full px-3 py-2 rounded-lg\" placeholder=\"Folder title (e.g., FY2024 Financial Records)\" value={title} onChange={e => setTitle(e.target.value)} />
        <textarea className=\"glass-input w-full px-3 py-2 rounded-lg\" placeholder=\"Description (optional)\" rows={2} value={description} onChange={e => setDescription(e.target.value)} />
        <input className=\"glass-input w-full px-3 py-2 rounded-lg\" placeholder=\"Fiscal year\" value={fiscalYear} onChange={e => setFiscalYear(e.target.value)} />
        <div className=\"flex gap-2 justify-end\">
          <Button variant=\"outline\" size=\"sm\" onClick={onClose}>Cancel</Button>
          <Button size=\"sm\" onClick={() => createMutation.mutate({ categoryId, title, description, fiscalYear })} disabled={!categoryId || !title || createMutation.isPending}>
            {createMutation.isPending ? <Loader2 className=\"h-4 w-4 animate-spin\" /> : 'Create'}
          </Button>
        </div>
      </div>
    </GlassCard>
  );
}
"""

with open(folders_page, 'w') as f:
    f.write(content)
print(f"✅ Updated {folders_page} with create folder form")

# Update the vital records page to include a designate form
vital_page = "src/app/(app)/admin/records-management/vital/page.tsx"
with open(vital_page, 'r') as f:
    content = f.read()

content = content.replace(
    "import { Loader2, ShieldCheck, ArrowLeft, CheckCircle } from 'lucide-react';",
    "import { Loader2, ShieldCheck, ArrowLeft, CheckCircle, Plus } from 'lucide-react';"
)
content = content.replace(
    "import { useRouter } from 'next/navigation';",
    "import { useRouter } from 'next/navigation';\nimport { useState } from 'react';"
)

# Add state, categories query, and create button
content = content.replace(
    """export default function VitalRecordsPage() {
  const { toast } = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();""",
    """export default function VitalRecordsPage() {
  const { toast } = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const { data: categoriesData } = useQuery<any>({
    queryKey: ['record-categories'],
    queryFn: () => api.get('/api/records/categories'),
  });
  const categories = categoriesData?.items || [];"""
)

# Add the create button and form before the list
content = content.replace(
    """      <div className=\"space-y-2\">
        {records.length === 0 ? (""",
    """      {showCreate && <DesignateVitalForm categories={categories} onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); queryClient.invalidateQueries({ queryKey: ['vital-records'] }); }} />}

      <div className=\"flex justify-end\">
        <Button size=\"sm\" onClick={() => setShowCreate(true)}><Plus className=\"h-4 w-4\" /> Designate Vital Record</Button>
      </div>

      <div className=\"space-y-2\">
        {records.length === 0 ? ("""
)

# Add the DesignateVitalForm at the end
content += """

function DesignateVitalForm({ categories, onClose, onCreated }: { categories: any[]; onClose: () => void; onCreated: () => void }) {
  const { toast } = useToast();
  const [documentId, setDocumentId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [vitalReason, setVitalReason] = useState('operational');
  const [recordType, setRecordType] = useState('important');
  const [recoveryPriority, setRecoveryPriority] = useState(3);
  const [reviewCycleMonths, setReviewCycleMonths] = useState(12);
  const [notes, setNotes] = useState('');

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/api/records/vital', data),
    onSuccess: () => { toast({ title: 'Vital record designated' }); onCreated(); },
    onError: (err: any) => toast({ title: 'Failed', description: err?.message, variant: 'destructive' }),
  });

  return (
    <GlassCard className=\"p-6\">
      <h3 className=\"font-semibold mb-4\">Designate Vital Record</h3>
      <div className=\"space-y-4\">
        <input className=\"glass-input w-full px-3 py-2 rounded-lg\" placeholder=\"Document ID\" value={documentId} onChange={e => setDocumentId(e.target.value)} />
        <select className=\"glass-input w-full px-3 py-2 rounded-lg\" value={categoryId} onChange={e => setCategoryId(e.target.value)}>
          <option value=\"\">Select category (optional)...</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
        </select>
        <div className=\"grid grid-cols-2 gap-4\">
          <select className=\"glass-input px-3 py-2 rounded-lg\" value={vitalReason} onChange={e => setVitalReason(e.target.value)}>
            <option value=\"operational\">Operational</option>
            <option value=\"legal\">Legal</option>
            <option value=\"financial\">Financial</option>
            <option value=\"historical\">Historical</option>
          </select>
          <select className=\"glass-input px-3 py-2 rounded-lg\" value={recordType} onChange={e => setRecordType(e.target.value)}>
            <option value=\"essential\">Essential (highest)</option>
            <option value=\"important\">Important</option>
            <option value=\"useful\">Useful</option>
          </select>
        </div>
        <div className=\"grid grid-cols-2 gap-4\">
          <div className=\"flex items-center gap-2\">
            <label className=\"text-sm whitespace-nowrap\">Priority (1-5):</label>
            <input type=\"number\" min=\"1\" max=\"5\" className=\"glass-input w-20 px-3 py-2 rounded-lg\" value={recoveryPriority} onChange={e => setRecoveryPriority(Number(e.target.value))} />
          </div>
          <div className=\"flex items-center gap-2\">
            <label className=\"text-sm whitespace-nowrap\">Review (months):</label>
            <input type=\"number\" min=\"1\" max=\"36\" className=\"glass-input w-20 px-3 py-2 rounded-lg\" value={reviewCycleMonths} onChange={e => setReviewCycleMonths(Number(e.target.value))} />
          </div>
        </div>
        <textarea className=\"glass-input w-full px-3 py-2 rounded-lg\" placeholder=\"Notes (optional)\" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
        <div className=\"flex gap-2 justify-end\">
          <Button variant=\"outline\" size=\"sm\" onClick={onClose}>Cancel</Button>
          <Button size=\"sm\" onClick={() => createMutation.mutate({ documentId, categoryId: categoryId || undefined, vitalReason, recordType, recoveryPriority, reviewCycleMonths, notes })} disabled={!documentId || createMutation.isPending}>
            {createMutation.isPending ? <Loader2 className=\"h-4 w-4 animate-spin\" /> : 'Designate'}
          </Button>
        </div>
      </div>
    </GlassCard>
  );
}
"""

with open(vital_page, 'w') as f:
    f.write(content)
print(f"✅ Updated {vital_page} with designate vital record form")
