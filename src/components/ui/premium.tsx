'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Premium dual-ring spinner
 */
export function PremiumSpinner({ size = 'md', className }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const sizeClass = size === 'sm' ? 'spinner-premium-sm' : size === 'lg' ? 'spinner-premium-lg' : '';
  return <div role="status" aria-label="Loading" className={cn('spinner-premium', sizeClass, className)} />;
}

/**
 * Premium dual-ring spinner (more elaborate)
 */
export function DualSpinner({ className }: { className?: string }) {
  return <div role="status" aria-label="Loading" className={cn('spinner-dual', className)} />;
}

/**
 * Premium progress bar with shimmer
 */
export function PremiumProgress({
  value,
  max = 100,
  className,
  variant = 'accent',
}: {
  value: number;
  max?: number;
  className?: string;
  variant?: 'accent' | 'success' | 'warning' | 'danger';
}) {
  const pct = Math.min(100, (value / max) * 100);
  const gradient =
    variant === 'success' ? 'var(--gradient-success)' :
    variant === 'warning' ? 'var(--gradient-warning)' :
    variant === 'danger' ? 'var(--gradient-danger)' :
    'var(--gradient-accent)';
  return (
    <div className={cn('progress-premium', className)}>
      <div
        className="progress-premium-bar"
        style={{ width: `${pct}%`, background: gradient }}
      />
    </div>
  );
}

/**
 * Premium skeleton with shimmer
 */
export function PremiumSkeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton-premium', className)} />;
}

/**
 * Animated stat counter
 */
export function AnimatedCounter({
  value,
  duration = 1,
  className,
  format,
}: {
  value: number;
  duration?: number;
  className?: string;
  format?: (v: number) => string;
}) {
  return (
    <motion.span
      className={className}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <CountUp value={value} duration={duration} format={format} />
    </motion.span>
  );
}

function CountUp({ value, duration, format }: { value: number; duration: number; format?: (v: number) => string }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    let raf: number;
    const start = performance.now();
    const startVal = 0;
    const animate = (now: number) => {
      const elapsed = (now - start) / 1000;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(startVal + (value - startVal) * eased);
      setDisplay(current);
      if (progress < 1) {
        raf = requestAnimationFrame(animate);
      }
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <>{format ? format(display) : display.toLocaleString()}</>;
}

import { useState, useEffect } from 'react';

/**
 * Premium glass card with hover lift
 */
export function GlassCard({
  children,
  className,
  hover = true,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.4, 0, 0.2, 1] }}
      className={cn('glass-card p-6', hover && 'hover-lift', className)}
    >
      {children}
    </motion.div>
  );
}

/**
 * Stagger container for list animations
 */
export function StaggerContainer({
  children,
  className,
  stagger = 0.05,
}: {
  children: React.ReactNode;
  className?: string;
  stagger?: number;
}) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="visible"
      variants={{
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: {
            staggerChildren: stagger,
          },
        },
      }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Stagger item
 */
export function StaggerItem({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y: 12 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.4, 0, 0.2, 1] } },
      }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Page transition wrapper
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Premium button with shimmer effect
 */
export function PremiumButton({
  children,
  onClick,
  disabled,
  variant = 'primary',
  size = 'md',
  className,
  type = 'button',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'accent' | 'success' | 'danger' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  type?: 'button' | 'submit';
}) {
  const variantClass =
    variant === 'accent' ? 'btn-gradient-accent' :
    variant === 'success' ? 'btn-gradient-success' :
    variant === 'danger' ? 'btn-gradient-danger' :
    variant === 'outline' ? 'glass-input' :
    '';
  const sizeClass =
    size === 'sm' ? 'h-8 px-3 text-xs' :
    size === 'lg' ? 'h-12 px-8 text-base' :
    'h-10 px-4 text-sm';

  return (
    <motion.button
      type={type}
      onClick={onClick}
      disabled={disabled}
      whileHover={{ scale: disabled ? 1 : 1.02 }}
      whileTap={{ scale: disabled ? 1 : 0.98 }}
      className={cn(
        'btn-premium rounded-lg font-medium inline-flex items-center justify-center gap-2',
        variantClass,
        sizeClass,
        disabled && 'opacity-50 cursor-not-allowed',
        className,
      )}
    >
      {children}
    </motion.button>
  );
}

/**
 * Premium empty state
 */
export function PremiumEmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className={cn('flex flex-col items-center justify-center py-12 text-center', className)}
    >
      <div className="relative mb-4">
        <div className="absolute inset-0 blur-2xl opacity-20 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-full" />
        <div className="relative h-16 w-16 rounded-2xl glass-card flex items-center justify-center">
          <Icon className="h-8 w-8 text-muted-foreground" />
        </div>
      </div>
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="text-xs text-muted-foreground mt-1 max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </motion.div>
  );
}

/**
 * Loading state with premium spinner + message
 */
export function LoadingState({ message = 'Loading…', className }: { message?: string; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-12 gap-3', className)}>
      <DualSpinner />
      <p className="text-sm text-muted-foreground animate-pulse">{message}</p>
    </div>
  );
}

/**
 * Badge with gradient
 */
export function GradientBadge({
  children,
  variant = 'accent',
  className,
}: {
  children: React.ReactNode;
  variant?: 'accent' | 'success' | 'warning' | 'danger';
  className?: string;
}) {
  const gradient =
    variant === 'success' ? 'var(--gradient-success)' :
    variant === 'warning' ? 'var(--gradient-warning)' :
    variant === 'danger' ? 'var(--gradient-danger)' :
    'var(--gradient-accent)';
  return (
    <span
      className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium text-white', className)}
      style={{ background: gradient }}
    >
      {children}
    </span>
  );
}
