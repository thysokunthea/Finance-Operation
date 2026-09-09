'use client';
import { useEffect, useMemo, useState } from 'react';
import { CalendarCheck2, Check, CircleAlert, Clock3, Filter, Plus, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge'; import { Button } from '@/components/ui/button'; import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'; import { Input } from '@/components/ui/input';

type TaskItem = { id: string; name: string; category: string; related: string; due: string; priority: string; status: string };
const statusStyle: Record<string, string> = { 'Not Started': 'border-slate-200 bg-slate-50 text-slate-700', 'In Progress': 'border-sky-200 bg-sky-50 text-sky-700', Waiting: 'border-amber-200 bg-amber-50 text-amber-700', Completed: 'border-emerald-200 bg-emerald-50 text-emerald-700' };

export function TasksContent() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('Open');
  const [busyId, setBusyId] = useState('');

  const load = () => {
    setLoading(true);
    fetch('/api/tasks', { cache: 'no-store' })
      .then(async (response) => {
        const payload = (await response.json()) as { tasks?: TaskItem[]; error?: string };
        if (!response.ok) throw new Error(payload.error || 'Tasks could not be loaded.');
        setTasks(payload.tasks || []);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Tasks could not be loaded.'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const visible = useMemo(
    () => tasks.filter((t) => `${t.name} ${t.related}`.toLowerCase().includes(query.toLowerCase()) && (filter === 'All' || (filter === 'Open' && t.status !== 'Completed') || t.status === filter)),
    [tasks, query, filter],
  );

  const complete = async (id: string) => {
    setBusyId(id);
    try {
      const response = await fetch('/api/tasks', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
      const payload = (await response.json()) as { tasks?: TaskItem[]; error?: string };
      if (!response.ok) throw new Error(payload.error || 'Task could not be updated.');
      setTasks(payload.tasks || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Task could not be updated.');
    } finally {
      setBusyId('');
    }
  };

  const createTask = async () => {
    try {
      const response = await fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'New finance task', category: 'Manual', due: 'Today', priority: 'Medium' }) });
      const payload = (await response.json()) as { tasks?: TaskItem[]; error?: string };
      if (!response.ok) throw new Error(payload.error || 'Task could not be created.');
      setTasks(payload.tasks || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Task could not be created.');
    }
  };

  const dueToday = tasks.filter((t) => t.status !== 'Completed' && /today/i.test(t.due)).length;
  const inProgress = tasks.filter((t) => t.status === 'In Progress').length;
  const completedCount = tasks.filter((t) => t.status === 'Completed').length;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="mb-1 text-xs text-muted-foreground">Workflow / My Tasks</p>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">My finance tasks</h1>
          <p className="mt-1 text-sm text-muted-foreground">Everything requiring your attention, ordered by urgency.</p>
        </div>
        <Button onClick={createTask}><Plus /> Create task</Button>
      </div>
      {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="gap-0"><CardContent className="flex items-center gap-4 p-5"><span className="grid size-10 place-items-center rounded-xl bg-red-50 text-red-600"><CircleAlert /></span><div><p className="metric-value text-2xl font-semibold">{loading ? '…' : dueToday}</p><p className="text-xs text-muted-foreground">Due today</p></div></CardContent></Card>
        <Card className="gap-0"><CardContent className="flex items-center gap-4 p-5"><span className="grid size-10 place-items-center rounded-xl bg-sky-50 text-sky-600"><Clock3 /></span><div><p className="metric-value text-2xl font-semibold">{loading ? '…' : inProgress}</p><p className="text-xs text-muted-foreground">In progress</p></div></CardContent></Card>
        <Card className="gap-0"><CardContent className="flex items-center gap-4 p-5"><span className="grid size-10 place-items-center rounded-xl bg-emerald-50 text-emerald-600"><CalendarCheck2 /></span><div><p className="metric-value text-2xl font-semibold">{loading ? '…' : completedCount}</p><p className="text-xs text-muted-foreground">Completed</p></div></CardContent></Card>
      </div>
      <Card className="gap-0">
        <CardHeader className="border-b"><CardTitle>Task queue</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="flex flex-col gap-2 border-b p-3 md:flex-row">
            <div className="relative flex-1"><Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search task or related record" className="h-9 pl-8" /></div>
            <select value={filter} onChange={(e) => setFilter(e.target.value)} className="h-9 rounded-lg border bg-card px-3 text-sm"><option>Open</option><option>All</option><option>Not Started</option><option>In Progress</option><option>Waiting</option><option>Completed</option></select>
            <Button variant="outline" onClick={() => { setQuery(''); setFilter('Open'); }}><Filter />Reset filters</Button>
          </div>
          <div className="divide-y">
            {visible.map((task) => (
              <div key={task.id} className="grid gap-3 p-4 transition hover:bg-muted/30 md:grid-cols-[minmax(0,1fr)_130px_120px_auto] md:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-2"><p className="font-medium">{task.name}</p>{task.priority === 'High' ? <Badge variant="destructive">High</Badge> : null}</div>
                  <p className="mt-1 text-xs text-muted-foreground">{task.id.slice(0, 8)} · {task.category} · {task.related}</p>
                </div>
                <div><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Due</p><p className="mt-1 text-xs font-medium">{task.due}</p></div>
                <Badge variant="outline" className={statusStyle[task.status]}>{task.status}</Badge>
                <Button size="sm" variant={task.status === 'Completed' ? 'outline' : 'default'} disabled={task.status === 'Completed' || busyId === task.id} onClick={() => complete(task.id)}>
                  <Check />{task.status === 'Completed' ? 'Completed' : busyId === task.id ? 'Saving…' : 'Complete'}
                </Button>
              </div>
            ))}
            {!loading && visible.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">No tasks match this filter.</div> : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
