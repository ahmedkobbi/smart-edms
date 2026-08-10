'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import Placeholder from '@tiptap/extension-placeholder';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { Doc as YDoc } from 'yjs';
import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Users, Bold, Italic, List, Code, Radio, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface CollaborativeEditorProps {
  documentId: string;
  tenantId: string;
  userId: string;
  userName: string;
  userEmail: string;
  wsEndpoint: string;
  docName: string;
  initialContent?: string;
}

const COLORS = [
  '#0ea5e9', '#8b5cf6', '#ec4899', '#f59e0b',
  '#10b981', '#ef4444', '#6366f1', '#14b8a6',
];

function pickColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash << 5) - hash + id.charCodeAt(i);
  return COLORS[Math.abs(hash) % COLORS.length];
}

interface PresenceUser {
  userId: string;
  email: string;
  name: string;
  color: string;
}

export function CollaborativeEditor({
  documentId, tenantId, userId, userName, userEmail, wsEndpoint, docName, initialContent,
}: CollaborativeEditorProps) {
  const [connected, setConnected] = useState(false);
  const [presence, setPresence] = useState<PresenceUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const providerRef = useRef<HocuspocusProvider | null>(null);
  const ydocRef = useRef<YDoc | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Disable collaboration-conflicting extensions
        ...( { history: false } as any),
      }),
      Placeholder.configure({
        placeholder: 'Start collaborating… Type here and others will see your changes in real-time.',
      }),
    ],
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[300px] p-4',
      },
    },
  });

  useEffect(() => {
    if (!editor || !wsEndpoint) return;

    // Create Yjs document
    const ydoc = new YDoc();
    ydocRef.current = ydoc;

    // Create Hocuspocus provider
    const provider = new HocuspocusProvider({
      url: wsEndpoint,
      name: docName,
      document: ydoc,
      token: localStorage.getItem('smart-edms-collab-token') || 'dev-token',
      onConnect: () => {
        setConnected(true);
        setError(null);
      },
      onDisconnect: () => {
        setConnected(false);
      },
      onAwarenessUpdate: ({ states }) => {
        const users: PresenceUser[] = states
          .map((state: any) => state.user)
          .filter(Boolean);
        setPresence(users);
      },
      onAuthenticationFailed: () => {
        setError('Authentication failed. Please sign in again.');
        setConnected(false);
      },
      onError: ((err: any) => {
        setError(err?.message || 'Connection error');
        setConnected(false);
      }) as any,
    } as any);
    providerRef.current = provider;

    // Register collaboration extension
    (editor as any).registerExtension(Collaboration.configure({ document: ydoc }));
    (editor as any).registerExtension(
      CollaborationCursor.configure({
        provider,
        user: {
          name: userName || userEmail,
          color: pickColor(userId),
        },
      }),
    );

    // If there's initial content and the doc is empty, seed it
    if (initialContent) {
      const yText = ydoc.getText('content');
      if (yText.toString().length === 0) {
        yText.insert(0, initialContent);
      }
    }

    return () => {
      provider.destroy();
      ydoc.destroy();
    };
  }, [editor, wsEndpoint, docName, documentId, userId, userName, userEmail, initialContent]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <div className="h-12 w-12 rounded-full bg-red-100 dark:bg-red-950/30 flex items-center justify-center">
          <XCircle className="h-6 w-6 text-red-500" />
        </div>
        <p className="text-sm font-medium">Connection failed</p>
        <p className="text-xs text-muted-foreground">{error}</p>
        <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-3"
    >
      {/* Toolbar + presence bar */}
      <div className="flex items-center justify-between gap-3 p-3 glass-card border-0 rounded-lg">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => editor?.chain().focus().toggleBold().run()}
            disabled={!connected}
          >
            <Bold className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => editor?.chain().focus().toggleItalic().run()}
            disabled={!connected}
          >
            <Italic className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
            disabled={!connected}
          >
            <List className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
            disabled={!connected}
          >
            <Code className="h-4 w-4" />
          </Button>
        </div>

        {/* Presence indicators */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className={cn(
              'h-2 w-2 rounded-full',
              connected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400',
            )} />
            <span className="text-xs text-muted-foreground">
              {connected ? 'Connected' : 'Connecting…'}
            </span>
          </div>
          {presence.length > 0 && (
            <div className="flex items-center gap-1">
              <Users className="h-3.5 w-3.5 text-muted-foreground" />
              <div className="flex -space-x-2">
                <AnimatePresence>
                  {presence.slice(0, 5).map((user) => (
                    <motion.div
                      key={user.userId}
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      className="h-7 w-7 rounded-full flex items-center justify-center text-xs font-medium text-white border-2 border-white dark:border-slate-900"
                      style={{ backgroundColor: user.color }}
                      title={`${user.name} (${user.email})`}
                    >
                      {user.name.slice(0, 2).toUpperCase()}
                    </motion.div>
                  ))}
                </AnimatePresence>
                {presence.length > 5 && (
                  <div className="h-7 w-7 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-xs font-medium border-2 border-white dark:border-slate-900">
                    +{presence.length - 5}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Editor */}
      <div className={cn(
        'glass-card border-0 rounded-lg overflow-hidden transition-opacity',
        !connected && 'opacity-50',
      )}>
        {!connected && (
          <div className="flex items-center justify-center py-8 gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Connecting to collaboration service…</span>
          </div>
        )}
        <EditorContent editor={editor} />
      </div>

      {/* Status footer */}
      <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
        <span>
          {presence.length} collaborator{presence.length !== 1 ? 's' : ''} online
        </span>
        <span className="flex items-center gap-1">
          <Radio className="h-3 w-3" />
          Auto-saved every 5s
        </span>
      </div>
    </motion.div>
  );
}
