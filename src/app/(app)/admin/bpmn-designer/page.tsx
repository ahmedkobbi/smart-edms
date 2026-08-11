'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { GlassCard, PremiumSkeleton, PremiumEmptyState } from '@/components/ui/premium';
import { Loader2, Workflow, Plus, Eye, GitBranch, Clock, CheckCircle } from 'lucide-react';
import { useI18n } from '@/i18n/use-i18n';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

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

  const definitions = data?.items || [];

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Workflow className="h-7 w-7 text-primary" />
            {t('bpmnDesigner.title')}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{t('bpmnDesigner.subtitle')}</p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">{t('bpmnDesigner.newProcess')}</span>
          <span className="sm:hidden">New</span>
        </Button>
      </motion.div>

      {/* Create Form */}
      <AnimatePresence>
        {showCreate && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            <CreateProcessForm
              onClose={() => setShowCreate(false)}
              onCreated={(id: string) => { setShowCreate(false); router.push(`/admin/bpmn-designer/${id}`); }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* List */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <GlassCard key={i} className="p-5" hover={false}>
                <div className="flex items-center justify-between">
                  <div className="flex-1 space-y-2">
                    <PremiumSkeleton className="h-5 w-48" />
                    <PremiumSkeleton className="h-4 w-72" />
                    <PremiumSkeleton className="h-4 w-32" />
                  </div>
                  <PremiumSkeleton className="h-8 w-8 rounded-lg" />
                </div>
              </GlassCard>
            ))}
          </div>
        ) : definitions.length === 0 ? (
          <PremiumEmptyState icon={Workflow} title={t('bpmnDesigner.noProcesses')} />
        ) : (
          <AnimatePresence mode="popLayout">
            {definitions.map((def: any, i: number) => (
              <motion.div key={def.id} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ delay: i * 0.05 }}>
                <GlassCard
                  className="p-5 cursor-pointer group"
                  onClick={() => router.push(`/admin/bpmn-designer/${def.id}`)}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className="font-semibold truncate">{def.name}</h3>
                        <Badge variant="outline" className="shrink-0">v{def.version}</Badge>
                        <Badge
                          variant="secondary"
                          className={`capitalize shrink-0 ${def.status === 'published' ? 'bg-green-500/10 text-green-700 dark:text-green-400' : ''}`}
                        >
                          {def.status === 'published' && <CheckCircle className="h-3 w-3 me-1" />}
                          {def.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-1">{def.description || 'No description'}</p>
                      <div className="flex gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <GitBranch className="h-3 w-3" />
                          {t('bpmnDesigner.key')}: <code className="glass-input px-1.5 py-0.5 rounded font-mono text-xs">{def.processKey}</code>
                        </span>
                        {def.publishedAt && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {t('bpmnDesigner.published')}: {new Date(def.publishedAt).toLocaleDateString()}
                          </span>
                        )}
                        <span>{def._count?.instances || 0} {t('bpmnDesigner.instances')}</span>
                      </div>
                    </div>
                    <div className="p-2 rounded-xl bg-primary/5 shrink-0 transition-transform group-hover:scale-110">
                      <Eye className="h-5 w-5 text-primary" />
                    </div>
                  </div>
                </GlassCard>
              </motion.div>
            ))}
          </AnimatePresence>
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
  const [errors, setErrors] = useState<Record<string, string>>({});

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const template: any = await api.post('/api/bpmn/definitions/template', { processKey: data.processKey, name: data.name });
      return api.post('/api/bpmn/definitions', { ...data, bpmnXml: template.xml });
    },
    onSuccess: (result: any) => { toast({ title: t('bpmnDesigner.processCreated') }); onCreated(result.definition.id); },
    onError: (err: any) => toast({ title: t('bpmnDesigner.failed'), description: err?.message, variant: 'destructive' }),
  });

  const handleSubmit = () => {
    const newErrors: Record<string, string> = {};
    if (processKey.length < 2) newErrors.processKey = 'Minimum 2 characters';
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(processKey)) newErrors.processKey = 'Letters, numbers, underscores only';
    if (name.length < 3) newErrors.name = 'Minimum 3 characters';
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    createMutation.mutate({ processKey, name, description });
  };

  return (
    <GlassCard className="p-6" hover={false}>
      <h3 className="font-semibold mb-4 flex items-center gap-2">
        <Plus className="h-5 w-5 text-primary" />
        {t('bpmnDesigner.createProcess')}
      </h3>
      <div className="space-y-4">
        <div>
          <input
            className={`glass-input w-full px-3 py-2 rounded-lg font-mono ${errors.processKey ? 'ring-2 ring-red-500/30' : ''}`}
            placeholder={t('bpmnDesigner.processKey')}
            value={processKey}
            onChange={e => { setProcessKey(e.target.value.replace(/[^a-zA-Z0-9_]/g, '')); setErrors({}); }}
          />
          {errors.processKey && <p className="text-xs text-red-500 mt-1">{errors.processKey}</p>}
        </div>
        <div>
          <input
            className={`glass-input w-full px-3 py-2 rounded-lg ${errors.name ? 'ring-2 ring-red-500/30' : ''}`}
            placeholder={t('bpmnDesigner.processName')}
            value={name}
            onChange={e => { setName(e.target.value); setErrors({}); }}
          />
          {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
        </div>
        <textarea
          className="glass-input w-full px-3 py-2 rounded-lg resize-none"
          placeholder={t('bpmnDesigner.descriptionOptional')}
          rows={2}
          value={description}
          onChange={e => setDescription(e.target.value)}
        />
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="outline" size="sm" onClick={onClose}>{t('bpmnDesigner.cancel')}</Button>
          <Button size="sm" onClick={handleSubmit} disabled={!processKey || !name || createMutation.isPending}>
            {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t('bpmnDesigner.create')}
          </Button>
        </div>
      </div>
    </GlassCard>
  );
}
