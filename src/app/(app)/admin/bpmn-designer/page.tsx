'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { GlassCard } from '@/components/ui/premium';
import { Loader2, Workflow, Plus, Play, Eye } from 'lucide-react';
import { useI18n } from '@/i18n/use-i18n';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { motion } from 'framer-motion';

export default function BpmnDesignerPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading } = useQuery<any>({
    queryKey: ['bpmn-definitions'],
    queryFn: () => api.get('/api/bpmn/definitions'),
  });

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const definitions = data?.items || [];

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Workflow className="h-6 w-6 text-primary" />
            BPMN Workflow Designer
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{t('bpmnDesigner.subtitle')}</p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" /> {t('bpmnDesigner.newProcess')}
        </Button>
      </div>

      {showCreate && <CreateProcessForm onClose={() => setShowCreate(false)} onCreated={(id: string) => { setShowCreate(false); router.push(`/admin/bpmn-designer/${id}`); }} />}

      <div className="space-y-3">
        {definitions.length === 0 ? (
          <GlassCard className="p-12 text-center" hover={false}>
            <Workflow className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">{t('bpmnDesigner.noProcesses')}</p>
          </GlassCard>
        ) : (
          definitions.map((def: any, i: number) => (
            <motion.div key={def.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <div className="cursor-pointer" onClick={() => router.push(`/admin/bpmn-designer/${def.id}`)}>
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold">{def.name}</h3>
                      <Badge variant="outline">v{def.version}</Badge>
                      <Badge variant="secondary" className="capitalize">{def.status}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{def.description || 'No description'}</p>
                    <div className="text-xs text-muted-foreground mt-2">
                      {t('bpmnDesigner.key')}: <code className="glass-input px-1.5 py-0.5 rounded">{def.processKey}</code>
                      {def.publishedAt && <span className="ms-3">{t('bpmnDesigner.published')}: {new Date(def.publishedAt).toLocaleDateString()}</span>}
                      <span className="ms-3">{def._count?.instances || 0} {t('bpmnDesigner.instances')}</span>
                    </div>
                  </div>
                  <Eye className="h-5 w-5 text-muted-foreground" />
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}

function CreateProcessForm({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [processKey, setProcessKey] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const template: any = await api.post('/api/bpmn/definitions/template', { processKey: data.processKey, name: data.name });
      return api.post('/api/bpmn/definitions', { ...data, bpmnXml: template.xml });
    },
    onSuccess: (result: any) => { toast({ title: t('bpmnDesigner.processCreated') }); onCreated(result.definition.id); },
    onError: (err: any) => toast({ title: t('bpmnDesigner.failed'), description: err?.message, variant: 'destructive' }),
  });

  return (
    <GlassCard className="p-6">
      <h3 className="font-semibold mb-4">{t('bpmnDesigner.createProcess')}</h3>
      <div className="space-y-4">
        <input className="glass-input w-full px-3 py-2 rounded-lg" placeholder={t('bpmnDesigner.processKey')} value={processKey} onChange={e => setProcessKey(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))} />
        <input className="glass-input w-full px-3 py-2 rounded-lg" placeholder={t('bpmnDesigner.processName')} value={name} onChange={e => setName(e.target.value)} />
        <textarea className="glass-input w-full px-3 py-2 rounded-lg" placeholder={t('bpmnDesigner.descriptionOptional')} rows={2} value={description} onChange={e => setDescription(e.target.value)} />
        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>{t('bpmnDesigner.cancel')}</Button>
          <Button size="sm" onClick={() => createMutation.mutate({ processKey, name, description })} disabled={!processKey || !name || createMutation.isPending}>
            {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t('bpmnDesigner.create')}
          </Button>
        </div>
      </div>
    </GlassCard>
  );
}
