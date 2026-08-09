'use client';

import { useEffect, useRef, useState } from 'react';

export default function ApiDocsPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // Load Swagger UI CSS
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui.css';
    document.head.appendChild(link);

    // Load Swagger UI script
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-bundle.js';
    script.async = true;
    script.onload = () => setLoaded(true);
    document.body.appendChild(script);

    return () => {
      link.remove();
      script.remove();
    };
  }, []);

  useEffect(() => {
    if (!loaded || !containerRef.current) return;

    // Fetch the OpenAPI spec
    fetch('/api/openapi')
      .then((res) => res.json())
      .then((spec) => {
        // Clear loading placeholder
        if (containerRef.current) {
          containerRef.current.innerHTML = '';
        }
        // Initialize Swagger UI
        (window as any).SwaggerUIBundle({
          spec,
          domNode: containerRef.current,
          deepLinking: true,
          presets: [(window as any).SwaggerUIBundle.presets.apis],
          layout: 'BaseLayout',
        });
      })
      .catch((err) => {
        console.error('Failed to load OpenAPI spec:', err);
      });
  }, [loaded]);

  return (
    <div className="min-h-screen bg-white">
      <div ref={containerRef}>
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900 mx-auto mb-4" />
            <p className="text-sm text-muted-foreground">Loading API documentation…</p>
          </div>
        </div>
      </div>
    </div>
  );
}
