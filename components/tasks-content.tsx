'use client';
import { workflowLabel } from '@/lib/workflow-labels';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarCheck2,
  Check,
  CircleAlert,
  Clock3,
  Filter,
  Plus,
  Search,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useLanguage } from '@/lib/i18n';
import { taskStatusLabels, translateEnum } from '@/lib/translations';

type TaskItem = {
  id: string;
  name: string;
  category: string;
  related: string;
  due: string;
  priority: string;
  status: string;
};
const statusStyle: Record<string, string> = {
  'Not Started': 'border-slate-200 bg-slate-50 text-slate-700',
  'In Progress': 'border-sky-200 bg-sky-50 text-sky-700',
  Waiting: 'border-amber-200 bg-amber-50 text-amber-700',
  Completed: 'border-emerald-200 bg-emerald-50 text-emerald-700',
};

export function TasksContent() {
  const { t, lang } = useLanguage();
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('Open');
  const [busyId, setBusyId] = useState('');
  const [editing, setEditing] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState({
    name: '',
    category: 'Manual',
    due: '',
    priority: 'Medium',
    related: '',
    status: 'Not Started',
  });

  const load = useCallback(() => {
    fetch('/api/tasks', { cache: 'no-store' })
      .then(async (response) => {
        const payload = (await response.json()) as {
          tasks?: TaskItem[];
          error?: string;
        };
        if (!response.ok)
          throw new Error(payload.error || t('tasks.loadFailed'));
        setTasks(payload.tasks || []);
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : t('tasks.loadFailed')),
      )
      .finally(() => setLoading(false));
  }, [t]);

  useEffect(load, [load]);

  const visible = useMemo(
    () =>
      tasks.filter(
        (task) =>
          `${task.name} ${task.related}`
            .toLowerCase()
            .includes(query.toLowerCase()) &&
          (filter === 'All' ||
            (filter === 'Open' && task.status !== 'Completed') ||
            task.status === filter),
      ),
    [tasks, query, filter],
  );

  const complete = async (id: string) => {
    setBusyId(id);
    try {
      const response = await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const payload = (await response.json()) as {
        tasks?: TaskItem[];
        error?: string;
      };
      if (!response.ok)
        throw new Error(payload.error || t('tasks.updateFailed'));
      setTasks(payload.tasks || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('tasks.updateFailed'));
    } finally {
      setBusyId('');
    }
  };

  const createTask = async (event: React.SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busyId) return;
    setBusyId('form');
    try {
      const response = await fetch('/api/tasks', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...draft, id: editing }),
      });
      const payload = (await response.json()) as {
        tasks?: TaskItem[];
        error?: string;
      };
      if (!response.ok)
        throw new Error(payload.error || t('tasks.createFailed'));
      setTasks(payload.tasks || []);
      setFormOpen(false);
      setEditing('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('tasks.createFailed'));
    } finally {
      setBusyId('');
    }
  };

  const dueToday = tasks.filter(
    (task) =>
      task.status !== 'Completed' &&
      (/today/i.test(task.due) ||
        task.due === new Date().toLocaleDateString('en-CA')),
  ).length;
  const inProgress = tasks.filter(
    (task) => task.status === 'In Progress',
  ).length;
  const completedCount = tasks.filter(
    (task) => task.status === 'Completed',
  ).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="mb-1 text-xs text-muted-foreground">
            {t('section.workflow')} / {t('nav.tasks')}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            {t('tasks.title')}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('tasks.subtitle')}
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing('');
            setDraft({
              name: '',
              category: 'Manual',
              due: '',
              priority: 'Medium',
              related: '',
              status: 'Not Started',
            });
            setFormOpen(true);
          }}
        >
          <Plus /> {t('tasks.createTask')}
        </Button>
      </div>
      {formOpen ? (
        <form
          onSubmit={createTask}
          className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2"
        >
          {(['name', 'category', 'related'] as const).map((key) => (
            <label key={key} className="text-sm">
              {key === 'name'
                ? workflowLabel(lang, 'Task name')
                : key === 'category'
                  ? workflowLabel(lang, 'Category')
                  : workflowLabel(lang, 'Related reference')}
              <Input
                required={key === 'name'}
                value={draft[key]}
                onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
              />
            </label>
          ))}
          <label className="text-sm">
            {t('tasks.due')}
            <Input
              type="date"
              value={draft.due}
              onChange={(e) => setDraft({ ...draft, due: e.target.value })}
            />
          </label>
          <label className="text-sm">
            {workflowLabel(lang, 'Priority')}
            <select
              className="block rounded border p-2"
              value={draft.priority}
              onChange={(e) => setDraft({ ...draft, priority: e.target.value })}
            >
              {['Low', 'Medium', 'High'].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            {workflowLabel(lang, 'Status')}
            <select
              className="block rounded border p-2"
              value={draft.status}
              onChange={(e) => setDraft({ ...draft, status: e.target.value })}
            >
              {Object.keys(taskStatusLabels.en).map((v) => (
                <option key={v} value={v}>
                  {translateEnum(taskStatusLabels, lang, v)}
                </option>
              ))}
            </select>
          </label>
          <Button disabled={!!busyId} type="submit">
            {t('tx.saveTransaction')}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setFormOpen(false)}
          >
            {t('tx.cancel')}
          </Button>
        </form>
      ) : null}
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="gap-0">
          <CardContent className="flex items-center gap-4 p-5">
            <span className="grid size-10 place-items-center rounded-xl bg-red-50 text-red-600">
              <CircleAlert />
            </span>
            <div>
              <p className="metric-value text-2xl font-semibold">
                {loading ? '…' : dueToday}
              </p>
              <p className="text-xs text-muted-foreground">
                {t('tasks.dueToday')}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="gap-0">
          <CardContent className="flex items-center gap-4 p-5">
            <span className="grid size-10 place-items-center rounded-xl bg-sky-50 text-sky-600">
              <Clock3 />
            </span>
            <div>
              <p className="metric-value text-2xl font-semibold">
                {loading ? '…' : inProgress}
              </p>
              <p className="text-xs text-muted-foreground">
                {t('tasks.inProgress')}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="gap-0">
          <CardContent className="flex items-center gap-4 p-5">
            <span className="grid size-10 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
              <CalendarCheck2 />
            </span>
            <div>
              <p className="metric-value text-2xl font-semibold">
                {loading ? '…' : completedCount}
              </p>
              <p className="text-xs text-muted-foreground">
                {t('tasks.completed')}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
      <Card className="gap-0">
        <CardHeader className="border-b">
          <CardTitle>{t('tasks.queue')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="flex flex-col gap-2 border-b p-3 md:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('tasks.searchPlaceholder')}
                className="h-9 pl-8"
              />
            </div>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="h-9 rounded-lg border bg-card px-3 text-sm"
            >
              <option value="Open">{t('tasks.filterOpen')}</option>
              <option value="All">{t('tasks.filterAll')}</option>
              {Object.keys(taskStatusLabels.en).map((value) => (
                <option key={value} value={value}>
                  {translateEnum(taskStatusLabels, lang, value)}
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              onClick={() => {
                setQuery('');
                setFilter('Open');
              }}
            >
              <Filter />
              {t('tx.resetFilters')}
            </Button>
          </div>
          <div className="divide-y">
            {visible.map((task) => (
              <div
                key={task.id}
                className="grid gap-3 p-4 transition hover:bg-muted/30 md:grid-cols-[minmax(0,1fr)_130px_120px_auto] md:items-center"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{task.name}</p>
                    {task.priority === 'High' ? (
                      <Badge variant="destructive">{t('tasks.high')}</Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {task.id.slice(0, 8)} · {task.category} · {task.related}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {t('tasks.due')}
                  </p>
                  <p className="mt-1 text-xs font-medium">{task.due}</p>
                </div>
                <Badge variant="outline" className={statusStyle[task.status]}>
                  {translateEnum(taskStatusLabels, lang, task.status)}
                </Badge>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditing(task.id);
                    setDraft({
                      name: task.name,
                      category: task.category,
                      due: /^\d{4}-\d{2}-\d{2}$/.test(task.due) ? task.due : '',
                      priority: task.priority,
                      related: task.related,
                      status: task.status,
                    });
                    setFormOpen(true);
                  }}
                >
                  {workflowLabel(lang, 'Edit')}
                </Button>
                <Button
                  size="sm"
                  variant={task.status === 'Completed' ? 'outline' : 'default'}
                  disabled={task.status === 'Completed' || busyId === task.id}
                  onClick={() => complete(task.id)}
                >
                  <Check />
                  {task.status === 'Completed'
                    ? t('tasks.completed')
                    : busyId === task.id
                      ? t('tx.saving')
                      : t('tasks.complete')}
                </Button>
              </div>
            ))}
            {!loading && visible.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                {t('tasks.noMatch')}
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
