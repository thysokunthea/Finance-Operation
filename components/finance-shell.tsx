'use client';

import { useState } from 'react';
import { BarChart3, Bell, Bot, Building2, CalendarCheck2, CheckSquare2, ChevronDown, CircleDollarSign, ClipboardCheck, FileBarChart, FileText, FolderOpen, HandCoins, LayoutDashboard, Menu, ReceiptText, Search, Settings, Upload, WalletCards, X } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type NavKey = string;
const primaryNav = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, href: '/' },
  { key: 'transactions', label: 'Transactions', icon: ReceiptText, href: '/transactions' },
  { key: 'income', label: 'Income', icon: CircleDollarSign, href: '/income' },
  { key: 'expenses', label: 'Expenses', icon: WalletCards, href: '/expenses' },
  { key: 'receivables', label: 'Receivables', icon: HandCoins, href: '/receivables' },
  { key: 'payables', label: 'Payables', icon: Building2, href: '/payables' },
  { key: 'requests', label: 'Payment Requests', icon: FileText, href: '/payment-requests' },
  { key: 'budgets', label: 'Budgets', icon: BarChart3, href: '/budgets' },
];
const workflowNav = [
  { key: 'tasks', label: 'My Tasks', icon: CheckSquare2, href: '/tasks' },
  { key: 'approvals', label: 'Approvals', icon: ClipboardCheck, href: '/approvals', count: 8 },
  { key: 'documents', label: 'Documents', icon: FolderOpen, href: '/documents' },
  { key: 'reports', label: 'Reports', icon: FileBarChart, href: '/reports' },
  { key: 'import', label: 'Data Import', icon: Upload, href: '/import' },
  { key: 'closing', label: 'Monthly Closing', icon: CalendarCheck2, href: '/monthly-closing' },
  { key: 'assistant', label: 'AI Assistant', icon: Bot, href: '/assistant' },
];

export function FinanceShell({ children, active, userName, userEmail, demo }: { children: React.ReactNode; active: NavKey; userName: string; userEmail: string; demo: boolean }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const initials = userName.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div className="min-h-screen bg-background text-foreground lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button aria-label="Close navigation overlay" className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="relative flex h-full w-[min(86vw,320px)] flex-col bg-sidebar text-sidebar-foreground shadow-2xl">
            <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-4">
              <div className="grid size-9 place-items-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground"><BarChart3 className="size-5" /></div>
              <div className="flex-1"><p className="font-semibold text-white">LedgerFlow</p><p className="text-[11px] text-sidebar-foreground/55">Finance operations</p></div>
              <Button variant="ghost" size="icon" aria-label="Close navigation" className="text-white hover:bg-white/10" onClick={() => setMobileOpen(false)}><X /></Button>
            </div>
            <nav aria-label="Mobile navigation" className="flex-1 overflow-y-auto px-3 py-5">
              <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-sidebar-foreground/40">Finance</p>
              <div className="space-y-1">{primaryNav.map((item) => { const Icon = item.icon; const isActive = item.key === active; return <a key={item.key} href={item.href} aria-current={isActive ? 'page' : undefined} onClick={() => setMobileOpen(false)} className={cn('flex h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors', isActive ? 'bg-sidebar-accent font-medium text-white' : 'text-sidebar-foreground/72 hover:bg-sidebar-accent/65 hover:text-white')}><Icon className={cn('size-4', isActive && 'text-sidebar-primary')} /><span>{item.label}</span></a>; })}</div>
              <p className="mb-2 mt-7 px-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-sidebar-foreground/40">Workflow</p>
              <div className="space-y-1">{workflowNav.map((item) => { const Icon = item.icon; const isActive = item.key === active; return <a key={item.key} href={item.href} aria-current={isActive ? 'page' : undefined} onClick={() => setMobileOpen(false)} className={cn('flex h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors', isActive ? 'bg-sidebar-accent font-medium text-white' : 'text-sidebar-foreground/72 hover:bg-sidebar-accent/65 hover:text-white')}><Icon className={cn('size-4', isActive && 'text-sidebar-primary')} /><span>{item.label}</span>{item.count ? <span className="ml-auto rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-semibold text-amber-300">{item.count}</span> : null}</a>; })}</div>
              <p className="mb-2 mt-7 px-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-sidebar-foreground/40">Administration</p>
              <a href="/settings" aria-current={active === 'settings' ? 'page' : undefined} onClick={() => setMobileOpen(false)} className={cn('flex h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors', active === 'settings' ? 'bg-sidebar-accent font-medium text-white' : 'text-sidebar-foreground/72 hover:bg-sidebar-accent/65 hover:text-white')}><Settings className="size-4" /><span>Settings</span></a>
            </nav>
          </aside>
        </div>
      ) : null}
      <aside className="hidden min-h-screen bg-sidebar text-sidebar-foreground lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
        <div className="flex h-17 items-center gap-3 border-b border-sidebar-border px-5"><div className="grid size-9 place-items-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground shadow-[0_8px_22px_rgb(45_212_191/18%)]"><BarChart3 className="size-5" /></div><div><p className="font-semibold tracking-tight text-white">LedgerFlow</p><p className="text-[11px] text-sidebar-foreground/55">Finance operations</p></div></div>
        <nav aria-label="Primary navigation" className="flex-1 overflow-y-auto px-3 py-5">
          <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-sidebar-foreground/40">Finance</p>
          <div className="space-y-1">{primaryNav.map((item) => { const Icon = item.icon; const isActive = item.key === active; return <a key={item.key} href={item.href} aria-current={isActive ? 'page' : undefined} className={cn('flex h-9 items-center gap-3 rounded-lg px-3 text-[13px] transition-colors', isActive ? 'bg-sidebar-accent font-medium text-white' : 'text-sidebar-foreground/72 hover:bg-sidebar-accent/65 hover:text-white')}><Icon className={cn('size-4', isActive && 'text-sidebar-primary')} /><span>{item.label}</span></a>; })}</div>
          <p className="mb-2 mt-7 px-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-sidebar-foreground/40">Workflow</p>
          <div className="space-y-1">{workflowNav.map((item) => { const Icon = item.icon; const isActive = item.key === active; return <a key={item.key} href={item.href} aria-current={isActive ? 'page' : undefined} className={cn('flex h-9 items-center gap-3 rounded-lg px-3 text-[13px] transition-colors', isActive ? 'bg-sidebar-accent font-medium text-white' : 'text-sidebar-foreground/72 hover:bg-sidebar-accent/65 hover:text-white')}><Icon className={cn('size-4', isActive && 'text-sidebar-primary')} /><span>{item.label}</span>{item.count ? <span className="ml-auto rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-semibold text-amber-300">{item.count}</span> : null}</a>; })}</div>
        </nav>
        <div className="border-t border-sidebar-border p-3"><a href="/settings" className={cn('mb-2 flex h-9 items-center gap-3 rounded-lg px-3 text-[13px] transition-colors', active === 'settings' ? 'bg-sidebar-accent font-medium text-white' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/65 hover:text-white')}><Settings className="size-4" /> Settings</a><div className="flex items-center gap-3 rounded-xl bg-white/[0.055] p-2.5"><Avatar size="sm" className="size-8"><AvatarFallback className="bg-sidebar-primary font-semibold text-sidebar-primary-foreground">{initials}</AvatarFallback></Avatar><div className="min-w-0 flex-1"><p className="truncate text-xs font-medium text-white">{userName}</p><p className="truncate text-[10px] text-sidebar-foreground/45">Finance Manager</p></div><ChevronDown className="size-3.5 text-sidebar-foreground/45" /></div></div>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-card/95 px-4 backdrop-blur md:px-7"><Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><Menu /></Button><a href="/" className="flex items-center gap-2 lg:hidden"><span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground"><BarChart3 className="size-4" /></span><span className="hidden font-semibold sm:inline">LedgerFlow</span></a><div className="relative ml-auto hidden w-full max-w-sm md:block lg:ml-0"><Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Search transactions, invoices, vendors, and tasks" placeholder="Search records, people or tasks..." className="h-9 bg-muted/55 pl-8" /></div><div className="ml-auto flex items-center gap-2">{demo ? <Badge variant="outline" className="hidden border-amber-300 bg-amber-50 text-amber-700 sm:inline-flex">Demo workspace</Badge> : null}<Button variant="ghost" size="icon" aria-label="Notifications" className="relative"><Bell /><span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-amber-500 ring-2 ring-card" /></Button><div className="hidden items-center gap-2 border-l pl-3 sm:flex"><Avatar size="sm"><AvatarFallback className="bg-primary/12 font-semibold text-primary">{initials}</AvatarFallback></Avatar><div className="hidden xl:block"><p className="max-w-36 truncate text-xs font-medium">{userName}</p><p className="max-w-36 truncate text-[10px] text-muted-foreground">{userEmail}</p></div></div></div></header>
        <main className="mx-auto w-full max-w-[1600px] p-4 md:p-7">{children}</main>
      </div>
    </div>
  );
}
