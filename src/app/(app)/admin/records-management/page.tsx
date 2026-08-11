'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { GlassCard } from '@/components/ui/premium';
import { Loader2, FolderTree, ShieldCheck, AlertCircle, FileCheck, Download } from 'lucide-react';
import { useI18n } from '@/i18n/use-i18n';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';

export default function RecordsManagementPage() {
  const { t } = useI18n();
  const router = useRouter();

  const { data: reportData, isLoading: reportLoading } = useQuery<any>({
    queryKey: ['dod-compliance-report'],
    queryFn: () => api.get('/api/records/compliance-report'),
  });

  const { data: categoriesData } = useQuery<any>({
    queryKey: ['record-categories'],
    queryFn: () => api.get('/api/records/categories'),
  });

  if (reportLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const report = reportData;
  const categories = categoriesData?.items || [];

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <FolderTree className="h-6 w-6 text-primary" />
            Records Management (DoD 5015.02)
          </h1>
          <p className="text-sm text-muted-foreground mt-1">DoD 5015.02-compliant records management with file plans, vital records, and disposition</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => router.push('/admin/records-management/folders')}>
            <FolderTree className="h-4 w-4" /> Folders
          </Button>
          <Button variant="outline" size="sm" onClick={() => router.push('/admin/records-management/vital')}>
            <ShieldCheck className="h-4 w-4" /> Vital Records
          </Button>
          <Button variant="outline" size="sm" onClick={() => router.push('/admin/records-management/authorities')}>
            <FileCheck className="h-4 w-4" /> Authorities
          </Button>
        </div>
      </div>

      {report && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <GlassCard className="p-4 text-center" hover={false}>
              <div className="text-2xl font-bold">{report.summary.totalCategories}</div>
              <div className="text-xs text-muted-foreground">Categories</div>
            </GlassCard>
            <GlassCard className="p-4 text-center" hover={false}>
              <div className="text-2xl font-bold">{report.summary.totalFolders}</div>
              <div className="text-xs text-muted-foreground">Folders</div>
            </GlassCard>
            <GlassCard className="p-4 text-center" hover={false}>
              <div className="text-2xl font-bold text-green-600">{report.summary.vitalRecordsVerified}</div>
              <div className="text-xs text-muted-foreground">Vital Verified</div>
            </GlassCard>
            <GlassCard className="p-4 text-center" hover={false}>
              <div className="text-2xl font-bold text-amber-600">{report.summary.vitalRecordsDueReview}</div>
              <div className="text-xs text-muted-foreground">Due Review</div>
            </GlassCard>
            <GlassCard className="p-4 text-center" hover={false}>
              <div className="text-2xl font-bold">{report.summary.dispositionAuthorities}</div>
              <div className="text-xs text-muted-foreground">Authorities</div>
            </GlassCard>
          </div>

          <GlassCard className="p-6" hover={false}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-green-600" />
                DoD 5015.02 Compliance Status
              </h2>
              <Button variant="outline" size="sm" onClick={() => window.open('/api/records/compliance-report', '_blank')}>
                <Download className="h-4 w-4" /> Export
              </Button>
            </div>
            <div className="space-y-2">
              {report.requirements.map((req: any) => (
                <div key={req.id} className="flex items-center justify-between p-3 rounded-lg glass-card border">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-green-500/10">
                      {req.implemented ? <ShieldCheck className="h-4 w-4 text-green-600" /> : <AlertCircle className="h-4 w-4 text-amber-600" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{req.id}</Badge>
                        <span className="font-medium text-sm">{req.title}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{req.evidence}</p>
                    </div>
                  </div>
                  {req.implemented && <Badge className="bg-green-500/10 text-green-700 dark:text-green-400">Implemented</Badge>}
                </div>
              ))}
            </div>
          </GlassCard>
        </>
      )}

      <div>
        <h2 className="text-lg font-semibold mb-3">Record Categories</h2>
        <div className="space-y-2">
          {categories.length === 0 ? (
            <GlassCard className="p-8 text-center" hover={false}>
              <FolderTree className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
              <p className="text-muted-foreground">No record categories yet.</p>
            </GlassCard>
          ) : (
            categories.map((cat: any, i: number) => (
              <motion.div key={cat.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                <GlassCard className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{cat.code}</Badge>
                        <span className="font-medium">{cat.name}</span>
                        <Badge variant="secondary" className="capitalize">{cat.disposition}</Badge>
                        {cat.isVital && <Badge className="bg-red-500/10 text-red-700 dark:text-red-400">Vital</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{cat.description || 'No description'}</p>
                      {cat.retentionActiveYears != null && (
                        <p className="text-xs text-muted-foreground mt-1">Retention: {cat.retentionActiveYears} years active + {cat.retentionSemiActiveYears || 0} semi-active → {cat.dispositionAction || 'N/A'}</p>
                      )}
                    </div>
                    <div className="text-end text-xs text-muted-foreground">
                      {cat.folders?.length || 0} folders
                    </div>
                  </div>
                </GlassCard>
              </motion.div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
