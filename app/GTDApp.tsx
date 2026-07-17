"use client";

import {
  FormEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

type Status = "inbox" | "next" | "waiting" | "scheduled" | "someday" | "done";
type Project = { id: string; name: string; color: string; revision?: number; updatedAt?: string };
type Tag = { id: string; name: string; revision?: number; updatedAt?: string };
type Task = {
  id: string;
  projectId?: string;
  parentTaskId?: string;
  title: string;
  notes: string;
  status: Status;
  context: string;
  important: boolean;
  startDate?: string;
  dueDate?: string;
  estimate: number;
  sortOrder: number;
  tagIds: string[];
  dependencyIds: string[];
  revision?: number;
  updatedAt?: string;
};
type AppState = { projects: Project[]; tasks: Task[]; tags: Tag[]; dataVersion?: number };
type DraftItem = {
  tempId: string;
  title: string;
  notes: string;
  estimate: number;
  startDate?: string;
  dueDate?: string;
  dependsOn: string[];
};
type AuthConfig = { mode: "self-hosted"; setupRequired?: boolean };
type ToastItem = { id: string; message: string; type: "success" | "info" | "error" };
type McpTokenRecord = { id: string; name: string; scope: "read" | "write"; expiresAt: string | null; lastUsedAt: string | null; revokedAt: string | null; createdAt: string };
type DialogRequest = {
  id: string;
  kind: "confirm" | "prompt";
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  placeholder?: string;
  resolve: (value: boolean | string | null) => void;
};
type SettingsTab = "general" | "smtp" | "ai" | "mcp" | "account" | "data";
type UserPreferences = {
  defaultView: ViewKey;
  weekStartsOn: "monday" | "sunday";
  density: "comfortable" | "compact";
};
type ViewKey =
  | "inbox"
  | "today"
  | "next"
  | "projects"
  | "waiting"
  | "scheduled"
  | "someday"
  | "review"
  | "completed";

const uid = () => crypto.randomUUID();
const DAY = 86400000;
const iso = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (date: string, days: number) =>
  iso(new Date(new Date(`${date}T12:00:00`).getTime() + days * DAY));
const today = () => iso(new Date());
const startOfWeek = (date: string, weekStartsOn: "monday" | "sunday") => {
  const day = new Date(`${date}T12:00:00`).getDay();
  const offset = weekStartsOn === "monday" ? (day + 6) % 7 : day;
  return addDays(date, -offset);
};
const formatDate = (value?: string) =>
  value
    ? new Intl.DateTimeFormat("zh-CN", {
        month: "short",
        day: "numeric",
      }).format(new Date(`${value}T12:00:00`))
    : "未设置";

const projectPayload = ({ id: _id, revision: _revision, updatedAt: _updatedAt, ...project }: Project) => project;
const tagPayload = ({ id: _id, revision: _revision, updatedAt: _updatedAt, ...tag }: Tag) => tag;
const taskPayload = ({ id: _id, revision: _revision, updatedAt: _updatedAt, ...task }: Task) => task;
const taskMutationPayload = (task: Task) => ({ ...taskPayload(task), projectId: task.projectId || null, parentTaskId: task.parentTaskId || null, startDate: task.startDate || null, dueDate: task.dueDate || null });
const sameEntity = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

const seedState = (): AppState => {
  const now = today();
  return {
    projects: [
      { id: "p-launch", name: "新版产品发布", color: "#69d2c8" },
      { id: "p-home", name: "生活管理", color: "#a78bfa" },
      { id: "p-learn", name: "学习成长", color: "#f6b85a" },
    ],
    tags: [
      { id: "tag-focus", name: "深度工作" },
      { id: "tag-call", name: "沟通" },
      { id: "tag-quick", name: "15分钟" },
    ],
    tasks: [
      {
        id: "t-brief",
        projectId: "p-launch",
        title: "明确发布目标与成功指标",
        notes: "对齐首版范围、目标用户和核心指标。",
        status: "next",
        context: "电脑",
        important: true,
        startDate: addDays(now, -1),
        dueDate: addDays(now, 1),
        estimate: 3,
        sortOrder: 0,
        tagIds: ["tag-focus"],
        dependencyIds: [],
      },
      {
        id: "t-prototype",
        projectId: "p-launch",
        title: "完成核心流程原型",
        notes: "覆盖收集、组织、执行和回顾。",
        status: "next",
        context: "电脑",
        important: true,
        startDate: now,
        dueDate: addDays(now, 4),
        estimate: 5,
        sortOrder: 1,
        tagIds: ["tag-focus"],
        dependencyIds: ["t-brief"],
      },
      {
        id: "t-review",
        projectId: "p-launch",
        title: "邀请 5 位用户体验",
        notes: "记录卡点并按严重度排序。",
        status: "waiting",
        context: "沟通",
        important: false,
        startDate: addDays(now, 5),
        dueDate: addDays(now, 8),
        estimate: 4,
        sortOrder: 2,
        tagIds: ["tag-call"],
        dependencyIds: ["t-prototype"],
      },
      {
        id: "t-plan",
        projectId: "p-launch",
        title: "整理发布清单",
        notes: "包含内容、渠道和风险检查。",
        status: "scheduled",
        context: "电脑",
        important: false,
        startDate: addDays(now, 7),
        dueDate: addDays(now, 10),
        estimate: 4,
        sortOrder: 3,
        tagIds: ["tag-quick"],
        dependencyIds: ["t-review"],
      },
      {
        id: "t-dentist",
        projectId: "p-home",
        title: "预约年度牙科检查",
        notes: "优先选择周五下午。",
        status: "inbox",
        context: "电话",
        important: false,
        dueDate: addDays(now, 2),
        estimate: 1,
        sortOrder: 4,
        tagIds: ["tag-quick"],
        dependencyIds: [],
      },
      {
        id: "t-course",
        projectId: "p-learn",
        title: "完成产品分析课程第三章",
        notes: "整理一页学习笔记。",
        status: "someday",
        context: "电脑",
        important: false,
        estimate: 2,
        sortOrder: 5,
        tagIds: ["tag-focus"],
        dependencyIds: [],
      },
      {
        id: "t-done",
        projectId: "p-launch",
        title: "创建项目工作区",
        notes: "",
        status: "done",
        context: "电脑",
        important: false,
        startDate: addDays(now, -3),
        dueDate: addDays(now, -3),
        estimate: 1,
        sortOrder: 6,
        tagIds: [],
        dependencyIds: [],
      },
    ],
    dataVersion: 0,
  };
};

const freshSeedState = (): AppState => {
  const template = seedState();
  const projectIds = new Map(template.projects.map((item) => [item.id, uid()]));
  const tagIds = new Map(template.tags.map((item) => [item.id, uid()]));
  const taskIds = new Map(template.tasks.map((item) => [item.id, uid()]));
  return {
    projects: template.projects.map((item) => ({ ...item, id: projectIds.get(item.id)! })),
    tags: template.tags.map((item) => ({ ...item, id: tagIds.get(item.id)! })),
    tasks: template.tasks.map((item) => ({
      ...item,
      id: taskIds.get(item.id)!,
      projectId: item.projectId ? projectIds.get(item.projectId) : undefined,
      parentTaskId: item.parentTaskId ? taskIds.get(item.parentTaskId) : undefined,
      tagIds: item.tagIds.map((id) => tagIds.get(id)!).filter(Boolean),
      dependencyIds: item.dependencyIds.map((id) => taskIds.get(id)!).filter(Boolean),
    })),
    dataVersion: 0,
  };
};

const NAV: Array<{ key: ViewKey; icon: string; label: string }> = [
  { key: "inbox", icon: "⌄", label: "收集箱" },
  { key: "today", icon: "☀", label: "今天" },
  { key: "next", icon: "→", label: "下一步" },
  { key: "projects", icon: "▦", label: "项目" },
  { key: "waiting", icon: "◌", label: "等待中" },
  { key: "scheduled", icon: "□", label: "日程" },
  { key: "someday", icon: "◇", label: "将来 / 也许" },
  { key: "review", icon: "↻", label: "每周回顾" },
  { key: "completed", icon: "✓", label: "已完成" },
];

function AuthScreen({
  onSession,
  setupRequired,
}: {
  onSession: (token: string, email: string, openSmtp?: boolean) => void;
  setupRequired: boolean;
}) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [bootstrapToken, setBootstrapToken] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      if (setupRequired) {
        const response = await fetch("/api/auth/bootstrap", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, token: bootstrapToken }),
        });
        const data = (await response.json()) as { accessToken?: string; user?: { email?: string }; error?: string };
        if (!response.ok || !data.accessToken) throw new Error(data.error || "初始化登录失败");
        onSession(data.accessToken, data.user?.email || email, true);
        return;
      }
      if (!sent) {
        const response = await fetch("/api/auth/request-otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        const data = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(data.error || "验证码发送失败，请稍后再试");
        setSent(true);
        setMessage("6 位验证码已发送，请查看邮箱");
      } else {
        const response = await fetch("/api/auth/verify-otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, code }),
        });
        const data = (await response.json()) as {
          accessToken?: string;
          user?: { email?: string };
          error?: string;
        };
        if (!response.ok || !data.accessToken)
          throw new Error(data.error || "验证码无效或已过期");
        onSession(data.accessToken, data.user?.email || email);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "登录失败");
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="brand-mark">G</div>
        <div className="eyebrow">GTD · GANTT · AI</div>
        <h1>
          把复杂目标
          <br />
          变成清晰下一步
        </h1>
        <p>收集想法、安排时间，让 AI 帮你拆解真正可执行的行动。</p>
        <form onSubmit={submit}>
          {setupRequired ? (
            <>
              <label>管理员邮箱</label>
              <input autoFocus type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@example.com" />
              <label>首次部署令牌</label>
              <input type="password" required value={bootstrapToken} onChange={(e) => setBootstrapToken(e.target.value)} placeholder="GitHub Secret: BOOTSTRAP_TOKEN" />
            </>
          ) : !sent ? (
            <>
              <label>工作邮箱</label>
              <input
                autoFocus
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
              />
            </>
          ) : (
            <>
              <label>邮箱验证码</label>
              <input
                autoFocus
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
              />
              <button
                className="text-button"
                type="button"
                onClick={() => {
                  setSent(false);
                  setCode("");
                }}
              >
                更换邮箱
              </button>
            </>
          )}
          <button className="primary auth-submit" disabled={busy}>
            {busy ? "请稍候…" : setupRequired ? "进入后台配置邮件" : sent ? "进入 GTD Flow" : "发送验证码"}
          </button>
          {message && <div className="auth-message">{message}</div>}
        </form>
        <small>登录即代表你同意仅将任务数据用于个人效率管理。</small>
      </section>
      <aside className="auth-visual">
        <div className="visual-orbit one" />
        <div className="visual-orbit two" />
        <div className="visual-board">
          <span>今天 · 3 项</span>
          <strong>发布前完成用户验证</strong>
          <div className="mini-bar" />
          <strong>整理首版发布清单</strong>
          <div className="mini-bar short" />
          <strong>准备复盘问题</strong>
          <div className="mini-bar warm" />
        </div>
      </aside>
    </main>
  );
}

function TaskRow({
  task,
  active,
  project,
  onSelect,
  onToggle,
  onImportant,
  stepProgress,
  onOpenMenu,
}: {
  task: Task;
  active: boolean;
  project?: Project;
  onSelect: () => void;
  onToggle: () => void;
  onImportant: () => void;
  stepProgress?: { done: number; total: number };
  onOpenMenu: (event: ReactMouseEvent<HTMLElement>) => void;
}) {
  return (
    <article
      className={`task-row ${active ? "active" : ""}`}
      onClick={onSelect}
      onContextMenu={onOpenMenu}
    >
      <button
        className={`check ${task.status === "done" ? "checked" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        aria-label={task.status === "done" ? "标记未完成" : "标记完成"}
      >
        {task.status === "done" ? "✓" : ""}
      </button>
      <div className="task-copy">
        <strong className={task.status === "done" ? "strike" : ""}>
          {task.title}
        </strong>
        <div className="task-meta">
          {project && (
            <span>
              <i style={{ background: project.color }} />
              {project.name}
            </span>
          )}
          {task.dueDate && (
            <span
              className={
                task.dueDate < today() && task.status !== "done"
                  ? "overdue"
                  : ""
              }
            >
              □ {formatDate(task.dueDate)}
            </span>
          )}
          {task.context && <span>@{task.context}</span>}
          {stepProgress && stepProgress.total > 0 && (
            <span className="step-progress-meta">
              ↳ {stepProgress.done}/{stepProgress.total} 步
            </span>
          )}
        </div>
      </div>
      <button
        className={`star ${task.important ? "on" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          onImportant();
        }}
        aria-label="重要"
      >
        ☆
      </button>
    </article>
  );
}

function FriendlyDialog({ request, onClose }: { request: DialogRequest; onClose: () => void }) {
  const [value, setValue] = useState("");
  const finish = (result: boolean | string | null) => {
    request.resolve(result);
    onClose();
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") finish(request.kind === "confirm" ? false : null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  return createPortal(
    <div className="friendly-dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && finish(request.kind === "confirm" ? false : null)}>
      <section className="friendly-dialog" role="dialog" aria-modal="true" aria-labelledby={`dialog-${request.id}`}>
        <div className={`dialog-glyph ${request.danger ? "danger" : ""}`}>{request.danger ? "!" : request.kind === "prompt" ? "+" : "?"}</div>
        <div className="dialog-copy">
          <h2 id={`dialog-${request.id}`}>{request.title}</h2>
          <p>{request.description}</p>
          {request.kind === "prompt" && <input autoFocus value={value} onChange={(event) => setValue(event.target.value)} placeholder={request.placeholder} onKeyDown={(event) => { if (event.key === "Enter" && value.trim()) finish(value.trim()); }} />}
        </div>
        <footer>
          <button onClick={() => finish(request.kind === "confirm" ? false : null)}>取消</button>
          <button className={request.danger ? "danger" : "primary"} disabled={request.kind === "prompt" && !value.trim()} onClick={() => finish(request.kind === "confirm" ? true : value.trim())}>{request.confirmLabel}</button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}

function ToastStack({ items, onDismiss }: { items: ToastItem[]; onDismiss: (id: string) => void }) {
  return createPortal(
    <div className="toast-stack" aria-live="polite">
      {items.map((item) => <div key={item.id} className={`toast ${item.type}`} role="status"><i>{item.type === "success" ? "✓" : item.type === "error" ? "!" : "i"}</i><span>{item.message}</span><button onClick={() => onDismiss(item.id)} aria-label="关闭提示">×</button></div>)}
    </div>,
    document.body,
  );
}

function TaskContextMenu({ task, projects, x, y, onPatch, onDelete, onAI, onToast, onClose }: {
  task: Task;
  projects: Project[];
  x: number;
  y: number;
  onPatch: (patch: Partial<Task>) => void;
  onDelete: () => void;
  onAI: () => void;
  onToast: (message: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const run = (patch: Partial<Task>, message: string) => { onPatch(patch); onToast(message); onClose(); };
  useEffect(() => {
    const dismiss = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) onClose(); };
    const key = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("pointerdown", dismiss);
    window.addEventListener("keydown", key);
    return () => { window.removeEventListener("pointerdown", dismiss); window.removeEventListener("keydown", key); };
  }, [onClose]);
  const left = Math.max(12, Math.min(x, window.innerWidth - 316));
  const top = Math.max(12, Math.min(y, window.innerHeight - 590));
  return createPortal(
    <div ref={ref} className="task-context-menu" style={{ left, top }} role="menu" aria-label={`${task.title} 的快捷操作`}>
      <header><strong>{task.title}</strong><span>快捷操作</span></header>
      <button role="menuitem" onClick={() => run({ startDate:today(), dueDate:today(), status:"next" }, "已添加到今天")}><i>☀</i><span>添加到“今天”</span></button>
      <button role="menuitem" onClick={() => run({ important:!task.important }, task.important ? "已取消重要标记" : "已标记为重要")}><i>☆</i><span>{task.important ? "取消重要标记" : "标记为重要"}</span></button>
      <button role="menuitem" onClick={() => run({ status:task.status === "done" ? "next" : "done" }, task.status === "done" ? "任务已恢复" : "任务已完成")}><i>✓</i><span>{task.status === "done" ? "标记为未完成" : "标记为已完成"}</span></button>
      <div className="context-separator" />
      <button role="menuitem" onClick={() => run({ dueDate:today() }, "截止日期已设为今天")}><i>□</i><span>今天到期</span></button>
      <button role="menuitem" onClick={() => run({ dueDate:addDays(today(), 1) }, "截止日期已设为明天")}><i>□</i><span>明天到期</span></button>
      {(task.dueDate || task.startDate) && <button role="menuitem" onClick={() => run({ startDate:undefined, dueDate:undefined }, "已清除任务日期")}><i>×</i><span>清除日期</span></button>}
      <div className="context-separator" />
      <button role="menuitem" onClick={() => run({ status:"next" }, "已移到下一步")}><i>→</i><span>移到下一步</span></button>
      <button role="menuitem" onClick={() => run({ status:"waiting" }, "已移到等待中")}><i>◌</i><span>移到等待中</span></button>
      <button role="menuitem" className={projectsOpen ? "expanded" : ""} onClick={() => setProjectsOpen(!projectsOpen)}><i>▦</i><span>移动到项目</span><b>{projectsOpen ? "⌃" : "⌄"}</b></button>
      {projectsOpen && <div className="context-projects"><button onClick={() => run({ projectId:undefined }, "已移出项目")}>— 无项目</button>{projects.map((project) => <button key={project.id} onClick={() => run({ projectId:project.id }, `已移动到“${project.name}”`)}><i style={{ background:project.color }} />{project.name}</button>)}</div>}
      <button role="menuitem" onClick={() => { onAI(); onClose(); }}><i>✦</i><span>用 AI 拆分任务</span></button>
      <div className="context-separator" />
      <button role="menuitem" className="danger" onClick={() => { onDelete(); onClose(); }}><i>♲</i><span>删除任务</span><kbd>Delete</kbd></button>
    </div>,
    document.body,
  );
}

type SelectOption = {
  value: string;
  label: string;
  icon?: string;
  color?: string;
  meta?: string;
};

function SelectPopover({
  value,
  values = [],
  options,
  onChange,
  onMultiChange,
  onCreate,
  searchable = false,
  multiple = false,
  allowCreate = false,
  searchPlaceholder = "搜索选项…",
  multipleLabel = "项",
  createHint = "创建新选项",
  ariaLabel,
}: {
  value: string;
  values?: string[];
  options: SelectOption[];
  onChange: (value: string) => void;
  onMultiChange?: (values: string[]) => void;
  onCreate?: (label: string) => void;
  searchable?: boolean;
  multiple?: boolean;
  allowCreate?: boolean;
  searchPlaceholder?: string;
  multipleLabel?: string;
  createHint?: string;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState({ left: 0, top: 0, width: 300 });
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const filtered = useMemo(
    () =>
      options.filter((option) =>
        `${option.label} ${option.meta || ""}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [options, query],
  );
  const selected =
    options.find((option) => option.value === value) || options[0];
  const selectedMany = options.filter((option) =>
    values.includes(option.value),
  );
  const isSelected = (optionValue: string) =>
    multiple
      ? optionValue
        ? values.includes(optionValue)
        : values.length === 0
      : optionValue === value;
  const canCreate =
    allowCreate &&
    Boolean(query.trim()) &&
    !options.some(
      (option) => option.label.toLowerCase() === query.trim().toLowerCase(),
    );
  const place = useCallback(() => {
    const rect = trigger.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(320, window.innerWidth - 24);
    const estimated = Math.min(380, 58 + options.length * 44);
    const below = window.innerHeight - rect.bottom;
    const top =
      below >= Math.min(estimated, 260)
        ? rect.bottom + 6
        : Math.max(12, rect.top - estimated - 6);
    setPosition({
      left: Math.max(
        12,
        Math.min(window.innerWidth - width - 12, rect.right - width),
      ),
      top,
      width,
    });
  }, [options.length]);
  useEffect(() => {
    if (!open) return;
    place();
    setQuery("");
    setActive(
      Math.max(
        0,
        options.findIndex((option) => isSelected(option.value)),
      ),
    );
    const outside = (event: PointerEvent) => {
      if (
        !menu.current?.contains(event.target as Node) &&
        !trigger.current?.contains(event.target as Node)
      )
        setOpen(false);
    };
    const update = () => place();
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", update);
    document.addEventListener("scroll", update, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", update);
      document.removeEventListener("scroll", update, true);
    };
  }, [open, options.length, place, value, values.join("|")]);
  useEffect(() => {
    if (open && searchable)
      setTimeout(
        () => menu.current?.querySelector<HTMLInputElement>("input")?.focus(),
        0,
      );
  }, [open, searchable]);
  const choose = (next: string) => {
    if (multiple && onMultiChange) {
      if (!next) onMultiChange([]);
      else
        onMultiChange(
          values.includes(next)
            ? values.filter((item) => item !== next)
            : [...values, next],
        );
      return;
    }
    onChange(next);
    setOpen(false);
    trigger.current?.focus();
  };
  const createOption = () => {
    const label = query.trim();
    if (!label) return;
    if (onCreate) {
      onCreate(label);
      setQuery("");
      setActive(0);
    } else choose(label);
  };
  const keydown = (event: React.KeyboardEvent) => {
    if (!open && ["Enter", " ", "ArrowDown"].includes(event.key)) {
      event.preventDefault();
      setOpen(true);
      return;
    }
    if (!open) return;
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      trigger.current?.focus();
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => Math.min(filtered.length - 1, index + 1));
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(0, index - 1));
    }
    if (event.key === "Enter" && filtered[active]) {
      event.preventDefault();
      choose(filtered[active].value);
    } else if (event.key === "Enter" && canCreate) {
      event.preventDefault();
      createOption();
    }
  };
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={`select-trigger ${open ? "open" : ""}`}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={keydown}
      >
        <span className="select-value">
          {multiple && values.length > 1 ? (
            <>
              <b>✓</b>
              <span>
                {values.length} {multipleLabel}
              </span>
            </>
          ) : (
            <>
              {(multiple ? selectedMany[0] : selected)?.color && (
                <i
                  style={{
                    background: (multiple ? selectedMany[0] : selected)?.color,
                  }}
                />
              )}
              {(multiple ? selectedMany[0] : selected)?.icon && (
                <b>{(multiple ? selectedMany[0] : selected)?.icon}</b>
              )}
              <span>
                {(multiple ? selectedMany[0] : selected)?.label ||
                  options[0]?.label ||
                  "请选择"}
              </span>
            </>
          )}
        </span>
        <em>⌄</em>
      </button>
      {open &&
        createPortal(
          <div
            ref={menu}
            className="select-popover"
            style={position}
            onKeyDown={keydown}
          >
            {searchable && (
              <label className="select-search">
                <span>⌕</span>
                <input
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setActive(0);
                  }}
                  placeholder={searchPlaceholder}
                />
              </label>
            )}
            <div
              className="select-options"
              role="listbox"
              aria-multiselectable={multiple || undefined}
              aria-label={ariaLabel}
            >
              {filtered.length ? (
                filtered.map((option, index) => (
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected(option.value)}
                    className={`${isSelected(option.value) ? "selected" : ""} ${index === active ? "active" : ""}`}
                    key={option.value}
                    title={option.label}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => choose(option.value)}
                  >
                    <span className="option-leading">
                      {option.color && (
                        <i style={{ background: option.color }} />
                      )}
                      {option.icon && <b>{option.icon}</b>}
                      <span>
                        <strong>{option.label}</strong>
                        {option.meta && <small>{option.meta}</small>}
                      </span>
                    </span>
                    {isSelected(option.value) && <em>✓</em>}
                  </button>
                ))
              ) : !canCreate ? (
                <div className="select-empty">没有匹配的任务</div>
              ) : null}
              {canCreate && (
                <button
                  type="button"
                  className="select-create"
                  onClick={createOption}
                >
                  <span className="option-leading">
                    <b>＋</b>
                    <span>
                      <strong>使用“{query.trim()}”</strong>
                      <small>{createHint}</small>
                    </span>
                  </span>
                </button>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

function DependencyLines({
  tasks,
  start,
  cell,
}: {
  tasks: Task[];
  start: string;
  cell: number;
}) {
  const index = new Map(tasks.map((task, i) => [task.id, i]));
  return (
    <div className="dependencies" aria-hidden>
      {tasks.flatMap((task, row) =>
        task.dependencyIds.map((dep) => {
          const source = tasks.find((item) => item.id === dep);
          const sourceRow = index.get(dep);
          if (!source?.dueDate || !task.startDate || sourceRow == null)
            return null;
          const x1 =
            ((new Date(`${source.dueDate}T12:00:00`).getTime() -
              new Date(`${start}T12:00:00`).getTime()) /
              DAY +
              1) *
            cell;
          const x2 =
            ((new Date(`${task.startDate}T12:00:00`).getTime() -
              new Date(`${start}T12:00:00`).getTime()) /
              DAY) *
            cell;
          const y1 = sourceRow * 50 + 35;
          const y2 = row * 50 + 35;
          return (
            <span key={`${task.id}-${dep}`} className="dep-group">
              <i
                className="dep-h"
                style={{ left: x1, top: y1, width: Math.max(6, x2 - x1) }}
              />
              <i
                className="dep-v"
                style={{
                  left: x2,
                  top: Math.min(y1, y2),
                  height: Math.abs(y2 - y1),
                }}
              />
              <i className="dep-dot" style={{ left: x2 - 3, top: y2 - 3 }} />
            </span>
          );
        }),
      )}
    </div>
  );
}

function Gantt({
  tasks,
  projects,
  weekStartsOn,
  onChange,
  onSelect,
}: {
  tasks: Task[];
  projects: Project[];
  weekStartsOn: "monday" | "sunday";
  onChange: (id: string, patch: Partial<Task>) => void;
  onSelect: (id: string) => void;
}) {
  const [zoom, setZoom] = useState<"day" | "week" | "month">("week");
  const scheduled = tasks.filter(
    (task) => task.startDate && task.dueDate && task.status !== "done",
  );
  const unscheduled = tasks.filter(
    (task) => (!task.startDate || !task.dueDate) && task.status !== "done",
  );
  const earliest =
    scheduled.map((task) => task.startDate!).sort()[0] || today();
  const start = startOfWeek(earliest, weekStartsOn);
  const days = zoom === "month" ? 90 : zoom === "week" ? 42 : 21;
  const cell = zoom === "month" ? 9 : zoom === "week" ? 24 : 48;
  const columns = Array.from({ length: days }, (_, i) => addDays(start, i));
  const beginDrag = (
    event: ReactPointerEvent,
    task: Task,
    mode: "move" | "resize",
  ) => {
    event.stopPropagation();
    const x = event.clientX;
    const oldStart = task.startDate!;
    const oldDue = task.dueDate!;
    const move = (e: PointerEvent) => {
      const delta = Math.round((e.clientX - x) / cell);
      if (!delta) return;
      if (mode === "move")
        onChange(task.id, {
          startDate: addDays(oldStart, delta),
          dueDate: addDays(oldDue, delta),
        });
      else
        onChange(task.id, {
          dueDate: addDays(
            oldDue,
            Math.max(delta, -Math.max(0, task.estimate - 1)),
          ),
          estimate: Math.max(
            1,
            Math.round(
              (new Date(`${addDays(oldDue, delta)}T12:00:00`).getTime() -
                new Date(`${oldStart}T12:00:00`).getTime()) /
                DAY,
            ) + 1,
          ),
        });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  return (
    <section className="gantt">
      <div className="gantt-toolbar">
        <div>
          <strong>项目时间轴</strong>
          <span>
            {scheduled.length} 项已排期 · {unscheduled.length} 项待排期
          </span>
        </div>
        <div className="zoom">
          {(["day", "week", "month"] as const).map((value) => (
            <button
              key={value}
              className={zoom === value ? "active" : ""}
              onClick={() => setZoom(value)}
            >
              {value === "day" ? "日" : value === "week" ? "周" : "月"}
            </button>
          ))}
        </div>
      </div>
      <div className="gantt-scroll">
        <div className="gantt-grid" style={{ width: 260 + days * cell }}>
          <div className="gantt-corner">任务</div>
          <div
            className="gantt-dates"
            style={{ left: 260, width: days * cell }}
          >
            {columns.map((date, i) => (
              <span
                key={date}
                className={date === today() ? "today" : ""}
                style={{ width: cell }}
              >
                {zoom === "day" || i % (zoom === "week" ? 7 : 30) === 0
                  ? formatDate(date)
                  : ""}
              </span>
            ))}
          </div>
          <div className="gantt-names">
            {scheduled.map((task) => (
              <button key={task.id} onClick={() => onSelect(task.id)}>
                <i
                  style={{
                    background:
                      projects.find((p) => p.id === task.projectId)?.color ||
                      "#69d2c8",
                  }}
                />
                <span>{task.title}</span>
                <small>{task.estimate}天</small>
              </button>
            ))}
          </div>
          <div
            className="gantt-canvas"
            style={{
              left: 260,
              width: days * cell,
              backgroundSize: `${cell}px 50px`,
            }}
          >
            <DependencyLines tasks={scheduled} start={start} cell={cell} />
            {scheduled.map((task, row) => {
              const left =
                Math.round(
                  (new Date(`${task.startDate}T12:00:00`).getTime() -
                    new Date(`${start}T12:00:00`).getTime()) /
                    DAY,
                ) * cell;
              const duration = Math.max(
                1,
                Math.round(
                  (new Date(`${task.dueDate}T12:00:00`).getTime() -
                    new Date(`${task.startDate}T12:00:00`).getTime()) /
                    DAY,
                ) + 1,
              );
              const color =
                projects.find((p) => p.id === task.projectId)?.color ||
                "#69d2c8";
              return (
                <div
                  key={task.id}
                  className="gantt-bar"
                  onPointerDown={(e) => beginDrag(e, task, "move")}
                  onClick={() => onSelect(task.id)}
                  style={{
                    left,
                    top: row * 50 + 18,
                    width: Math.max(cell, duration * cell),
                    background: color,
                  }}
                >
                  <span>{task.title}</span>
                  <b onPointerDown={(e) => beginDrag(e, task, "resize")} />
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {unscheduled.length > 0 && (
        <div className="unscheduled">
          <span>待排期</span>
          {unscheduled.slice(0, 6).map((task) => (
            <button
              key={task.id}
              onClick={() =>
                onChange(task.id, {
                  startDate: today(),
                  dueDate: addDays(today(), Math.max(0, task.estimate - 1)),
                })
              }
            >
              ＋ {task.title}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function AIModal({
  task,
  token,
  onClose,
  onCommit,
}: {
  task: Task;
  token: string;
  onClose: () => void;
  onCommit: (items: DraftItem[]) => Promise<void>;
}) {
  const [step, setStep] = useState<"prompt" | "config" | "preview">("prompt");
  const [instruction, setInstruction] =
    useState("拆成每天都能完成、依赖清晰的行动");
  const [draft, setDraft] = useState<DraftItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [config, setConfig] = useState({
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4.1-mini",
    apiKey: "",
  });
  const demoDraft = () => {
    const start = task.startDate || today();
    return [
      "明确完成标准和所需资料",
      "完成第一版并记录待确认项",
      "检查结果并修正关键问题",
      "整理交付物并完成复盘",
    ].map((title, i) => ({
      tempId: `s${i + 1}`,
      title,
      notes:
        i === 0
          ? `围绕「${task.title}」确认范围与输出。`
          : "保持行动具体、可验证。",
      estimate: 1,
      startDate: addDays(start, i),
      dueDate: addDays(start, i),
      dependsOn: i ? [`s${i}`] : [],
    }));
  };
  const decompose = async () => {
    setBusy(true);
    setError("");
    try {
      if (!token) {
        setDraft(demoDraft());
        setStep("preview");
        return;
      }
      const response = await fetch("/api/ai/decompose", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: task.title,
          notes: task.notes,
          dueDate: task.dueDate,
          instruction,
        }),
      });
      const data = (await response.json()) as {
        items?: DraftItem[];
        error?: string;
      };
      if (response.status === 409) {
        setStep("config");
        return;
      }
      if (!response.ok || !data.items)
        throw new Error(data.error || "拆分失败");
      setDraft(data.items);
      setStep("preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "拆分失败");
    } finally {
      setBusy(false);
    }
  };
  const saveConfig = async () => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/ai/config", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(config),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "保存失败");
      setStep("prompt");
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <section className="modal">
        <header>
          <div>
            <span className="ai-glyph">✦</span>
            <div>
              <h2>AI 智能拆分</h2>
              <p>{task.title}</p>
            </div>
          </div>
          <button onClick={onClose}>×</button>
        </header>
        {step === "prompt" && (
          <div className="modal-body">
            <div className="ai-summary">
              <span>目标日期</span>
              <strong>{formatDate(task.dueDate)}</strong>
              <span>当前预计</span>
              <strong>{task.estimate} 天</strong>
            </div>
            <label>告诉 AI 你的偏好</label>
            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              rows={4}
            />
            <div className="hint">
              AI 将建议步骤、工期、日期和依赖关系；确认前不会写入任务。
            </div>
          </div>
        )}
        {step === "config" && (
          <div className="modal-body">
            <div className="callout">
              首次使用需要配置你的 OpenAI 兼容模型。密钥仅在服务端加密保存。
            </div>
            <label>Base URL</label>
            <input
              value={config.baseUrl}
              onChange={(e) =>
                setConfig({ ...config, baseUrl: e.target.value })
              }
            />
            <label>模型名称</label>
            <input
              value={config.model}
              onChange={(e) => setConfig({ ...config, model: e.target.value })}
            />
            <label>API Key</label>
            <input
              type="password"
              value={config.apiKey}
              onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
              placeholder="sk-…"
            />
          </div>
        )}
        {step === "preview" && (
          <div className="modal-body preview-list">
            <div className="preview-head">
              <strong>建议拆分为 {draft.length} 步</strong>
              <span>可直接编辑</span>
            </div>
            {draft.map((item, index) => (
              <div className="draft-item" key={item.tempId}>
                <span className="draft-index">{index + 1}</span>
                <div>
                  <input
                    value={item.title}
                    onChange={(e) =>
                      setDraft(
                        draft.map((x) =>
                          x.tempId === item.tempId
                            ? { ...x, title: e.target.value }
                            : x,
                        ),
                      )
                    }
                  />
                  <div className="draft-fields">
                    <input
                      type="date"
                      value={item.startDate || ""}
                      onChange={(e) =>
                        setDraft(
                          draft.map((x) =>
                            x.tempId === item.tempId
                              ? { ...x, startDate: e.target.value }
                              : x,
                          ),
                        )
                      }
                    />
                    <span>→</span>
                    <input
                      type="date"
                      value={item.dueDate || ""}
                      onChange={(e) =>
                        setDraft(
                          draft.map((x) =>
                            x.tempId === item.tempId
                              ? { ...x, dueDate: e.target.value }
                              : x,
                          ),
                        )
                      }
                    />
                  </div>
                </div>
                <button
                  onClick={() =>
                    setDraft(draft.filter((x) => x.tempId !== item.tempId))
                  }
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        {error && <div className="modal-error">{error}</div>}
        <footer>
          <button onClick={onClose}>取消</button>
          {step === "prompt" && (
            <button className="primary" disabled={busy} onClick={decompose}>
              {busy ? "AI 正在规划…" : "✦ 开始拆分"}
            </button>
          )}
          {step === "config" && (
            <button className="primary" disabled={busy} onClick={saveConfig}>
              {busy ? "保存中…" : "保存配置"}
            </button>
          )}
          {step === "preview" && (
            <button
              className="primary"
              disabled={!draft.length}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await onCommit(draft);
                } catch (error) {
                  setError(error instanceof Error ? error.message : "创建子任务失败");
                  setBusy(false);
                }
              }}
            >
              {busy ? "创建中…" : `确认并创建 ${draft.length} 项`}
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}

function SettingsDrawer({
  token,
  email,
  sync,
  preferences,
  state,
  onPreferencesChange,
  onClose,
  onSignOut,
  initialTab,
  onConfirm,
  onToast,
}: {
  token: string;
  email: string;
  sync: "saved" | "saving" | "error";
  preferences: UserPreferences;
  state: AppState;
  onPreferencesChange: (value: UserPreferences) => void;
  onClose: () => void;
  onSignOut: () => void;
  initialTab?: SettingsTab;
  onConfirm: (options: { title: string; description: string; confirmLabel: string; danger?: boolean }) => Promise<boolean>;
  onToast: (message: string, type?: ToastItem["type"]) => void;
}) {
  const [tab, setTab] = useState<SettingsTab>(initialTab || "general");
  const [mail, setMail] = useState({ provider:"smtp" as "smtp"|"resend", host:"", port:587, username:"", secret:"", mailFrom:"", secure:false, apiBaseUrl:"https://api.resend.com", hasSecret:false });
  const [smtpState, setSmtpState] = useState<"idle"|"loading"|"saving"|"testing"|"saved"|"error">("idle");
  const [smtpMessage, setSmtpMessage] = useState("");
  const [config, setConfig] = useState({
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4.1-mini",
    apiKey: "",
    hasKey: false,
  });
  const [aiState, setAiState] = useState<
    "idle" | "loading" | "saving" | "testing" | "saved" | "error"
  >("idle");
  const [aiMessage, setAiMessage] = useState("");
  const [mcpTokens, setMcpTokens] = useState<McpTokenRecord[]>([]);
  const [mcpEndpoint, setMcpEndpoint] = useState("");
  const [mcpName, setMcpName] = useState("我的 MCP 客户端");
  const [mcpScope, setMcpScope] = useState<"read" | "write">("write");
  const [mcpExpiry, setMcpExpiry] = useState("90");
  const [mcpRawToken, setMcpRawToken] = useState("");
  const [mcpBusy, setMcpBusy] = useState(false);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  useEffect(() => {
    if (!token) return;
    setAiState("loading");
    fetch("/api/ai/config", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (response) => {
        const data = (await response.json()) as {
          baseUrl?: string;
          model?: string;
          hasKey?: boolean;
          error?: string;
        } | null;
        if (!response.ok) throw new Error(data?.error || "读取配置失败");
        if (data) {
          setConfig({
            baseUrl: data.baseUrl || "https://api.openai.com/v1",
            model: data.model || "gpt-4.1-mini",
            apiKey: "",
            hasKey: Boolean(data.hasKey),
          });
        }
        setAiState("idle");
      })
      .catch((error) => {
        setAiState("error");
        setAiMessage(error instanceof Error ? error.message : "读取配置失败");
      });
  }, [token]);

  const loadMcpTokens = useCallback(async () => {
    if (!token) return;
    const response = await fetch("/api/mcp-tokens", { headers: { Authorization: `Bearer ${token}` } });
    const data = await response.json() as { tokens?: McpTokenRecord[]; endpoint?: string; error?: string };
    if (!response.ok) throw new Error(data.error || "读取 MCP Token 失败");
    setMcpTokens(data.tokens || []);
    setMcpEndpoint(data.endpoint || `${location.origin}/mcp`);
  }, [token]);

  useEffect(() => { if (tab === "mcp") void loadMcpTokens().catch((error) => onToast(error instanceof Error ? error.message : "读取 MCP Token 失败", "error")); }, [tab, loadMcpTokens, onToast]);

  const createMcpAccessToken = async () => {
    setMcpBusy(true);
    try {
      const response = await fetch("/api/mcp-tokens", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ name: mcpName, scope: mcpScope, expiresInDays: mcpExpiry === "never" ? null : Number(mcpExpiry) }) });
      const data = await response.json() as McpTokenRecord & { token?: string; error?: string };
      if (!response.ok || !data.token) throw new Error(data.error || "创建 MCP Token 失败");
      setMcpRawToken(data.token);
      await loadMcpTokens();
      onToast("MCP Token 已创建，请立即复制保存");
    } catch (error) { onToast(error instanceof Error ? error.message : "创建 MCP Token 失败", "error"); }
    finally { setMcpBusy(false); }
  };

  const revokeMcpAccessToken = async (item: McpTokenRecord) => {
    const approved = await onConfirm({ title: "撤销 MCP Token？", description: `“${item.name}”撤销后，使用它的客户端会立即失去访问权限。`, confirmLabel: "撤销 Token", danger: true });
    if (!approved) return;
    const response = await fetch(`/api/mcp-tokens/${encodeURIComponent(item.id)}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    const data = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) return onToast(data.error || "撤销失败", "error");
    await loadMcpTokens();
    onToast("MCP Token 已撤销");
  };

  const copyText = async (value: string, label: string) => {
    try { await navigator.clipboard.writeText(value); onToast(`${label}已复制`); }
    catch { onToast("复制失败，请手动选择文本复制", "error"); }
  };

  useEffect(() => {
    if (!token) return;
    setSmtpState("loading");
    fetch("/api/admin/mail", { headers:{ Authorization:`Bearer ${token}` } })
      .then(async (response) => {
        if (response.status === 403) { setSmtpState("idle"); return; }
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || "读取邮件配置失败");
        if (data) setMail((current) => ({ ...current, ...data, secret:"" }));
        setSmtpState("idle");
      })
      .catch((error) => { setSmtpState("error"); setSmtpMessage(error instanceof Error ? error.message : "读取邮件配置失败"); });
  }, [token]);

  const saveSmtp = async () => {
    setSmtpState("saving"); setSmtpMessage("");
    try {
      const response = await fetch("/api/admin/mail", { method:"PUT", headers:{ "Content-Type":"application/json", Authorization:`Bearer ${token}` }, body:JSON.stringify(mail) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "保存失败");
      setMail((current) => ({ ...current, ...data, secret:"" }));
      setSmtpState("saved"); setSmtpMessage("邮件服务已加密保存，现在可以使用邮箱验证码登录");
    } catch (error) { setSmtpState("error"); setSmtpMessage(error instanceof Error ? error.message : "保存失败"); }
  };

  const testSmtp = async () => {
    setSmtpState("testing"); setSmtpMessage("");
    try {
      const response = await fetch("/api/admin/mail/test", { method:"POST", headers:{ Authorization:`Bearer ${token}` } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "测试邮件发送失败");
      setSmtpState("saved"); setSmtpMessage(`测试邮件已发送到 ${email}`);
    } catch (error) { setSmtpState("error"); setSmtpMessage(error instanceof Error ? error.message : "测试失败"); }
  };

  const saveAIConfig = async () => {
    if (!token) return;
    setAiState("saving");
    setAiMessage("");
    try {
      const response = await fetch("/api/ai/config", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          baseUrl: config.baseUrl,
          model: config.model,
          apiKey: config.apiKey,
        }),
      });
      const data = (await response.json()) as {
        baseUrl?: string;
        model?: string;
        hasKey?: boolean;
        error?: string;
      };
      if (!response.ok) throw new Error(data.error || "保存失败");
      setConfig((current) => ({
        ...current,
        baseUrl: data.baseUrl || current.baseUrl,
        model: data.model || current.model,
        apiKey: "",
        hasKey: Boolean(data.hasKey),
      }));
      setAiState("saved");
      setAiMessage("AI 配置已安全保存");
    } catch (error) {
      setAiState("error");
      setAiMessage(error instanceof Error ? error.message : "保存失败");
    }
  };

  const deleteAIConfig = async () => {
    if (!token) return;
    const approved = await onConfirm({ title:"删除 AI 配置？", description:"已保存的模型地址与加密密钥将被永久删除，之后需要重新填写。", confirmLabel:"删除配置", danger:true });
    if (!approved) return;
    setAiState("saving");
    try {
      const response = await fetch("/api/ai/config", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("删除失败");
      setConfig({
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4.1-mini",
        apiKey: "",
        hasKey: false,
      });
      setAiState("saved");
      setAiMessage("AI 配置已删除");
    } catch (error) {
      setAiState("error");
      setAiMessage(error instanceof Error ? error.message : "删除失败");
    }
  };

  const testAIConfig = async () => {
    if (!token) return;
    setAiState("testing");
    setAiMessage("");
    try {
      const response = await fetch("/api/ai/config/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          baseUrl: config.baseUrl,
          model: config.model,
          apiKey: config.apiKey,
        }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        latencyMs?: number;
        error?: string;
      };
      if (!response.ok || !data.ok)
        throw new Error(data.error || "连接测试失败");
      setAiState("saved");
      setAiMessage(`连接成功 · ${data.latencyMs || 0} ms`);
    } catch (error) {
      setAiState("error");
      setAiMessage(error instanceof Error ? error.message : "连接测试失败");
    }
  };

  const exportData = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `gtd-flow-${today()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const tabs: { key: SettingsTab; icon: string; label: string }[] = [
    { key: "general", icon: "◫", label: "通用" },
    { key: "smtp", icon: "@", label: "邮件服务" },
    { key: "ai", icon: "✦", label: "AI 服务" },
    { key: "mcp", icon: "⌘", label: "MCP 接入" },
    { key: "account", icon: "◎", label: "账号与同步" },
    { key: "data", icon: "⇩", label: "数据" },
  ];

  return (
    <div className="settings-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="settings-drawer" aria-label="设置" role="dialog" aria-modal="true">
        <header className="settings-header">
          <div>
            <span className="eyebrow">GTD FLOW</span>
            <h2>设置</h2>
          </div>
          <button onClick={onClose} aria-label="关闭设置">×</button>
        </header>
        <div className="settings-layout">
          <nav className="settings-nav" aria-label="设置分类">
            {tabs.map((item) => (
              <button
                key={item.key}
                className={tab === item.key ? "active" : ""}
                onClick={() => setTab(item.key)}
              >
                <i>{item.icon}</i><span>{item.label}</span>
              </button>
            ))}
          </nav>
          <div className="settings-content">
            {tab === "general" && (
              <section className="settings-section">
                <div className="settings-title">
                  <h3>通用设置</h3>
                  <p>调整 GTD Flow 在这台设备上的使用方式。</p>
                </div>
                <div className="setting-card">
                  <div className="setting-row">
                    <div><strong>默认首页</strong><span>每次打开时优先进入的视图</span></div>
                    <div className="segmented">
                      {([['today', '今天'], ['inbox', '收集箱'], ['next', '下一步']] as const).map(([value, label]) => (
                        <button key={value} className={preferences.defaultView === value ? "active" : ""} onClick={() => onPreferencesChange({ ...preferences, defaultView: value })}>{label}</button>
                      ))}
                    </div>
                  </div>
                  <div className="setting-row">
                    <div><strong>每周开始日</strong><span>影响日程与甘特视图的周边界</span></div>
                    <div className="segmented">
                      <button className={preferences.weekStartsOn === "monday" ? "active" : ""} onClick={() => onPreferencesChange({ ...preferences, weekStartsOn: "monday" })}>周一</button>
                      <button className={preferences.weekStartsOn === "sunday" ? "active" : ""} onClick={() => onPreferencesChange({ ...preferences, weekStartsOn: "sunday" })}>周日</button>
                    </div>
                  </div>
                  <div className="setting-row">
                    <div><strong>界面密度</strong><span>紧凑模式可在同一屏展示更多任务</span></div>
                    <div className="segmented">
                      <button className={preferences.density === "comfortable" ? "active" : ""} onClick={() => onPreferencesChange({ ...preferences, density: "comfortable" })}>舒适</button>
                      <button className={preferences.density === "compact" ? "active" : ""} onClick={() => onPreferencesChange({ ...preferences, density: "compact" })}>紧凑</button>
                    </div>
                  </div>
                  <div className="setting-row static-row">
                    <div><strong>时区</strong><span>任务日期按你的默认时区显示</span></div>
                    <b>Asia/Shanghai</b>
                  </div>
                </div>
                <p className="settings-note">偏好会自动保存在当前设备。</p>
              </section>
            )}
            {tab === "smtp" && (
              <section className="settings-section">
                <div className="settings-title"><h3>邮件服务</h3><p>选择 SMTP 或 Resend API 发送 6 位登录验证码，仅管理员可访问。</p></div>
                <div className="ai-settings-card">
                  <div className="segmented">
                    <button className={mail.provider === "smtp" ? "active" : ""} onClick={() => mail.provider !== "smtp" && setMail({ ...mail, provider:"smtp", secret:"", hasSecret:false })}>SMTP</button>
                    <button className={mail.provider === "resend" ? "active" : ""} onClick={() => mail.provider !== "resend" && setMail({ ...mail, provider:"resend", secret:"", hasSecret:false })}>Resend API</button>
                  </div>
                  {mail.provider === "smtp" ? (<>
                    <label>SMTP 主机<input value={mail.host} onChange={(e) => setMail({ ...mail, host:e.target.value })} placeholder="smtp.example.com" /></label>
                    <label>端口<input type="number" min={1} max={65535} value={mail.port} onChange={(e) => setMail({ ...mail, port:Number(e.target.value) })} /></label>
                    <label>用户名<input value={mail.username} onChange={(e) => setMail({ ...mail, username:e.target.value })} placeholder="name@example.com" /></label>
                    <label>密码<input type="password" value={mail.secret} onChange={(e) => setMail({ ...mail, secret:e.target.value })} placeholder={mail.hasSecret ? "已保存；留空继续使用原密码" : "请输入 SMTP 密码"} /></label>
                    <div className="setting-row"><div><strong>SSL/TLS 直连</strong><span>通常仅 465 端口启用；587 使用 STARTTLS 时关闭</span></div><button className={mail.secure ? "primary" : "test-connection"} onClick={() => setMail({ ...mail, secure:!mail.secure })}>{mail.secure ? "已启用" : "未启用"}</button></div>
                  </>) : (<>
                    <label>API Base URL<input value={mail.apiBaseUrl} onChange={(e) => setMail({ ...mail, apiBaseUrl:e.target.value })} placeholder="https://api.resend.com" /></label>
                    <label>API Key<input type="password" value={mail.secret} onChange={(e) => setMail({ ...mail, secret:e.target.value })} placeholder={mail.hasSecret ? "已保存；留空继续使用原密钥" : "re_xxxxxxxxx"} /></label>
                    <p className="settings-note">需先在 Resend 验证发件域名；也支持兼容 Resend Send Email API 的公开 HTTPS 地址。</p>
                  </>)}
                  <label>发件人<input value={mail.mailFrom} onChange={(e) => setMail({ ...mail, mailFrom:e.target.value })} placeholder="GTD Flow <name@example.com>" /></label>
                  {smtpMessage && <div className={`settings-message ${smtpState}`}>{smtpMessage}</div>}
                  <div className="settings-actions"><button className="test-connection" onClick={testSmtp} disabled={!mail.hasSecret || smtpState === "testing" || smtpState === "saving"}>{smtpState === "testing" ? "发送中…" : "发送测试邮件"}</button><button className="primary" onClick={saveSmtp} disabled={smtpState === "saving"}>{smtpState === "saving" ? "保存中…" : "保存邮件配置"}</button></div>
                  <p className="security-note">SMTP 密码或 API Key 只发送到服务端并加密存储，浏览器不会读取已保存的原始密钥。</p>
                </div>
              </section>
            )}
            {tab === "ai" && (
              <section className="settings-section">
                <div className="settings-title">
                  <h3>AI 服务</h3>
                  <p>连接你自己的 OpenAI 兼容模型，用于自动拆分任务。</p>
                </div>
                {!token ? (
                  <div className="settings-empty"><span>✦</span><strong>请先登录账号</strong><p>登录后即可在 PostgreSQL 中安全保存加密后的模型配置。</p></div>
                ) : (
                  <div className="ai-settings-card">
                    <label>Base URL<input value={config.baseUrl} onChange={(event) => setConfig({ ...config, baseUrl: event.target.value })} placeholder="https://api.openai.com/v1" /></label>
                    <label>模型名称<input value={config.model} onChange={(event) => setConfig({ ...config, model: event.target.value })} placeholder="gpt-4.1-mini" /></label>
                    <label>
                      API Key
                      <input type="password" value={config.apiKey} onChange={(event) => setConfig({ ...config, apiKey: event.target.value })} placeholder={config.hasKey ? "已保存；留空则继续使用原密钥" : "输入新的 API Key"} />
                    </label>
                    <div className="key-status"><i className={config.hasKey ? "connected" : ""} /><span>{aiState === "loading" ? "正在读取配置…" : config.hasKey ? "密钥已加密保存" : "尚未保存密钥"}</span></div>
                    {aiMessage && <div className={`settings-message ${aiState}`}>{aiMessage}</div>}
                    <div className="settings-actions">
                      {config.hasKey && <button className="danger-ghost" onClick={deleteAIConfig} disabled={aiState === "saving"}>删除配置</button>}
                      <button className="test-connection" onClick={testAIConfig} disabled={aiState === "saving" || aiState === "loading" || aiState === "testing"}>{aiState === "testing" ? "测试中…" : "测试连接"}</button>
                      <button className="primary" onClick={saveAIConfig} disabled={aiState === "saving" || aiState === "loading" || aiState === "testing"}>{aiState === "saving" ? "保存中…" : "保存 AI 配置"}</button>
                    </div>
                    <p className="security-note">密钥只发送到服务端并加密存储，浏览器不会读取已保存的原始密钥。</p>
                  </div>
                )}
              </section>
            )}
            {tab === "mcp" && (
              <section className="settings-section">
                <div className="settings-title"><h3>MCP 接入</h3><p>让 Codex、Claude 或 Cursor 安全地读取和操作你的 GTD 数据。系统设置不会通过 MCP 暴露。</p></div>
                {!token ? <div className="settings-empty"><span>⌘</span><strong>请先登录账号</strong><p>个人访问令牌只能由已登录用户创建。</p></div> : <>
                  {mcpRawToken && <div className="mcp-secret-card"><div><strong>仅显示这一次</strong><button onClick={() => setMcpRawToken("")} aria-label="关闭">×</button></div><p>请立即复制并保存在客户端或密码管理器中，之后无法再次查看。</p><code>{mcpRawToken}</code><button className="primary" onClick={() => void copyText(mcpRawToken, "Token")}>复制 Token</button></div>}
                  <div className="ai-settings-card mcp-create-card">
                    <label>Token 名称<input value={mcpName} maxLength={80} onChange={(event) => setMcpName(event.target.value)} placeholder="例如：工作电脑上的 Codex" /></label>
                    <div className="mcp-choice"><strong>权限</strong><div className="segmented"><button className={mcpScope === "write" ? "active" : ""} onClick={() => setMcpScope("write")}>读写</button><button className={mcpScope === "read" ? "active" : ""} onClick={() => setMcpScope("read")}>只读</button></div></div>
                    <div className="mcp-choice"><strong>有效期</strong><div className="segmented"><button className={mcpExpiry === "30" ? "active" : ""} onClick={() => setMcpExpiry("30")}>30 天</button><button className={mcpExpiry === "90" ? "active" : ""} onClick={() => setMcpExpiry("90")}>90 天</button><button className={mcpExpiry === "365" ? "active" : ""} onClick={() => setMcpExpiry("365")}>365 天</button><button className={mcpExpiry === "never" ? "active" : ""} onClick={() => setMcpExpiry("never")}>永不过期</button></div></div>
                    <div className="settings-actions"><button className="primary" disabled={mcpBusy || !mcpName.trim()} onClick={() => void createMcpAccessToken()}>{mcpBusy ? "创建中…" : "创建 Token"}</button></div>
                  </div>
                  <h4 className="mcp-subtitle">已有 Token</h4>
                  <div className="mcp-token-list">{mcpTokens.length === 0 ? <div className="mcp-list-empty">尚未创建 Token</div> : mcpTokens.map((item) => <div className={`mcp-token-row ${item.revokedAt ? "revoked" : ""}`} key={item.id}><div><strong>{item.name}</strong><span>{item.scope === "write" ? "读写" : "只读"} · {item.revokedAt ? "已撤销" : item.expiresAt ? `${new Date(item.expiresAt).toLocaleDateString("zh-CN")} 到期` : "永不过期"}</span><small>{item.lastUsedAt ? `最后使用：${new Date(item.lastUsedAt).toLocaleString("zh-CN")}` : "尚未使用"}</small></div>{!item.revokedAt && <button className="danger-ghost" onClick={() => void revokeMcpAccessToken(item)}>撤销</button>}</div>)}</div>
                  <h4 className="mcp-subtitle">客户端配置</h4>
                  <div className="mcp-config-card"><div><span>Endpoint</span><button onClick={() => void copyText(mcpEndpoint, "Endpoint")}>复制</button></div><code>{mcpEndpoint}</code><p>请求头：<code>Authorization: Bearer &lt;你的 Token&gt;</code></p></div>
                  <details className="mcp-example"><summary>Codex 配置示例</summary><pre>{`[mcp_servers.gtd_flow]\nurl = "${mcpEndpoint}"\nbearer_token_env_var = "GTD_FLOW_MCP_TOKEN"`}</pre><button onClick={() => void copyText(`[mcp_servers.gtd_flow]\nurl = "${mcpEndpoint}"\nbearer_token_env_var = "GTD_FLOW_MCP_TOKEN"`, "配置")}>复制配置</button></details>
                  <details className="mcp-example"><summary>Claude / Cursor 配置示例</summary><pre>{JSON.stringify({ mcpServers: { "gtd-flow": { url: mcpEndpoint, headers: { Authorization: "Bearer <你的 Token>" } } } }, null, 2)}</pre></details>
                  <p className="security-note">服务端只保存 Token 的 HMAC 摘要。Token 可随时撤销，建议按设备分别创建并定期轮换。</p>
                </>}
              </section>
            )}
            {tab === "account" && (
              <section className="settings-section">
                <div className="settings-title"><h3>账号与同步</h3><p>查看当前账号及云端同步状态。</p></div>
                <div className="account-card">
                  <div className="account-avatar">{email[0]?.toUpperCase() || "G"}</div>
                  <div><strong>{token ? email : "GTD Flow 演示"}</strong><span>{token ? "邮箱验证码登录" : "数据仅保存在当前浏览器"}</span></div>
                  <em className={`sync-pill ${sync}`}>{sync === "saving" ? "同步中" : sync === "error" ? "同步异常" : token ? "已同步" : "本地模式"}</em>
                </div>
                {token && <button className="wide-secondary" onClick={onSignOut}>退出当前账号</button>}
              </section>
            )}
            {tab === "data" && (
              <section className="settings-section">
                <div className="settings-title"><h3>数据</h3><p>获取当前项目、任务和标签的便携副本。</p></div>
                <div className="data-card">
                  <div><span>JSON</span><div><strong>导出全部数据</strong><p>{state.projects.length} 个项目 · {state.tasks.length} 个任务 · {state.tags.length} 个标签</p></div></div>
                  <button onClick={exportData}>导出文件</button>
                </div>
                <p className="settings-note">导出不会删除或修改云端数据。</p>
              </section>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}

export function GTDApp() {
  const [authConfig, setAuthConfig] = useState<AuthConfig | null | undefined>(
    undefined,
  );
  const authReady = Boolean(authConfig);
  const [token, setToken] = useState("");
  const [email, setEmail] = useState("账户");
  const [state, setState] = useState<AppState>(() => ({ projects: [], tasks: [], tags: [], dataVersion: 0 }));
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<ViewKey>("today");
  const [mode, setMode] = useState<"list" | "gantt">("list");
  const [selectedId, setSelectedId] = useState<string>();
  const [search, setSearch] = useState("");
  const [quick, setQuick] = useState("");
  const [projectFilter, setProjectFilter] = useState<string>();
  const [aiTask, setAiTask] = useState<Task>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsTab>("general");
  const [preferences, setPreferences] = useState<UserPreferences>(() => ({
    defaultView: "today",
    weekStartsOn: "monday",
    density: "comfortable",
  }));
  const [navOpen, setNavOpen] = useState(false);
  const [sync, setSync] = useState<"saved" | "saving" | "error">("saved");
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [contextMenu, setContextMenu] = useState<{ taskId:string; x:number; y:number }>();
  const [dialog, setDialog] = useState<DialogRequest>();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const loaded = useRef(false);
  const syncing = useRef(false);
  const stateRef = useRef(state);
  const serverSnapshot = useRef<AppState>({ projects: [], tasks: [], tags: [], dataVersion: 0 });
  useEffect(() => { stateRef.current = state; }, [state]);
  const pushToast = useCallback((message: string, type: ToastItem["type"] = "success") => {
    const id = uid();
    setToasts((current) => [...current, { id, message, type }].slice(-4));
    window.setTimeout(() => setToasts((current) => current.filter((item) => item.id !== id)), 3600);
  }, []);
  const requestConfirm = useCallback((options: { title:string; description:string; confirmLabel:string; danger?:boolean }) =>
    new Promise<boolean>((resolve) => setDialog({ id:uid(), kind:"confirm", ...options, resolve:(value) => resolve(value === true) })), []);
  const requestPrompt = useCallback((options: { title:string; description:string; confirmLabel:string; placeholder?:string }) =>
    new Promise<string | null>((resolve) => setDialog({ id:uid(), kind:"prompt", ...options, resolve:(value) => resolve(typeof value === "string" ? value : null) })), []);
  useEffect(() => {
    fetch("/api/auth/config")
      .then(async (response) => (await response.json()) as AuthConfig | null)
      .then((value) => setAuthConfig(value))
      .catch(() => setAuthConfig(null));
  }, []);
  useEffect(() => {
    const stored = localStorage.getItem("gtdflow-preferences");
    if (!stored) return;
    try {
      const next = JSON.parse(stored) as Partial<UserPreferences>;
      setPreferences((current) => ({ ...current, ...next }));
      if (next.defaultView) setView(next.defaultView);
    } catch {
      localStorage.removeItem("gtdflow-preferences");
    }
  }, []);
  useEffect(() => {
    if (authConfig === undefined) return;
    const savedToken = localStorage.getItem("gtdflow-token") || "";
    const savedEmail = localStorage.getItem("gtdflow-email") || "";
    if (savedToken) {
      setToken(savedToken);
      setEmail(savedEmail);
    }
  }, [authConfig, authReady]);
  useEffect(() => {
    if (!authReady || !token) return;
    fetch("/api/state", { headers: { Authorization: `Bearer ${token}` } })
      .then(async (r) => {
        if (r.status === 401) {
          localStorage.removeItem("gtdflow-token");
          setToken("");
          return;
        }
        if (!r.ok) throw new Error();
        const data = (await r.json()) as AppState;
        serverSnapshot.current = data;
        if (data.tasks.length || data.projects.length || data.tags.length) {
          setState(data);
        } else {
          loaded.current = true;
          setState(freshSeedState());
        }
        setReady(true);
        setTimeout(() => {
          loaded.current = true;
        }, 0);
      })
      .catch(() => {
        setReady(true);
        setSync("error");
      });
  }, [authReady, token]);
  useEffect(() => {
    if (!ready || !loaded.current) return;
    if (!token) return;
    const desired = state;
    const base = serverSnapshot.current;
    const hasChanges =
      !sameEntity(desired.projects.map(projectPayload), base.projects.map(projectPayload)) ||
      !sameEntity(desired.tags.map(tagPayload), base.tags.map(tagPayload)) ||
      !sameEntity(desired.tasks.map(taskPayload), base.tasks.map(taskPayload));
    if (!hasChanges || syncing.current) return;
    setSync("saving");
    const timer = setTimeout(async () => {
      if (syncing.current) return;
      syncing.current = true;
      const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
      const request = async (url: string, init: RequestInit) => {
        const response = await fetch(url, { ...init, headers });
        const body = await response.json().catch(() => ({})) as { error?: string };
        if (!response.ok) {
          const error = new Error(body.error || "同步失败") as Error & { status?: number };
          error.status = response.status;
          throw error;
        }
        return body;
      };
      try {
        const oldProjects = new Map(base.projects.map((item) => [item.id, item]));
        const oldTags = new Map(base.tags.map((item) => [item.id, item]));
        const oldTasks = new Map(base.tasks.map((item) => [item.id, item]));

        for (const project of desired.projects) {
          const old = oldProjects.get(project.id);
          if (!old) await request("/api/projects", { method: "POST", body: JSON.stringify({ id: project.id, ...projectPayload(project) }) });
          else if (!sameEntity(projectPayload(project), projectPayload(old))) await request(`/api/projects/${encodeURIComponent(project.id)}`, { method: "PATCH", body: JSON.stringify({ expectedRevision: old.revision || 1, patch: projectPayload(project) }) });
        }
        for (const tag of desired.tags) {
          const old = oldTags.get(tag.id);
          if (!old) await request("/api/tags", { method: "POST", body: JSON.stringify({ id: tag.id, ...tagPayload(tag) }) });
          else if (!sameEntity(tagPayload(tag), tagPayload(old))) await request(`/api/tags/${encodeURIComponent(tag.id)}`, { method: "PATCH", body: JSON.stringify({ expectedRevision: old.revision || 1, patch: tagPayload(tag) }) });
        }

        const newTasks = desired.tasks.filter((item) => !oldTasks.has(item.id));
        const pending = [...newTasks];
        const available = new Set(base.tasks.map((item) => item.id));
        while (pending.length) {
          const index = pending.findIndex((item) => !item.parentTaskId || available.has(item.parentTaskId));
          const task = pending.splice(index < 0 ? 0 : index, 1)[0];
          await request("/api/tasks", { method: "POST", body: JSON.stringify({ id: task.id, ...taskMutationPayload(task), dependencyIds: [] }) });
          available.add(task.id);
        }
        for (const task of newTasks) {
          if (task.dependencyIds.length) await request(`/api/tasks/${encodeURIComponent(task.id)}`, { method: "PATCH", body: JSON.stringify({ expectedRevision: 1, patch: taskMutationPayload(task) }) });
        }
        for (const task of desired.tasks) {
          const old = oldTasks.get(task.id);
          if (old && !sameEntity(taskPayload(task), taskPayload(old))) await request(`/api/tasks/${encodeURIComponent(task.id)}`, { method: "PATCH", body: JSON.stringify({ expectedRevision: old.revision || 1, patch: taskMutationPayload(task) }) });
        }
        for (const old of base.tasks) {
          const removed = !desired.tasks.some((item) => item.id === old.id);
          const parentStillExists = Boolean(old.parentTaskId && desired.tasks.some((item) => item.id === old.parentTaskId));
          if (removed && (!old.parentTaskId || parentStillExists)) await request(`/api/tasks/${encodeURIComponent(old.id)}`, { method: "DELETE", body: JSON.stringify({ expectedRevision: old.revision || 1 }) });
        }
        for (const old of base.projects) {
          if (!desired.projects.some((item) => item.id === old.id)) await request(`/api/projects/${encodeURIComponent(old.id)}`, { method: "DELETE", body: JSON.stringify({ expectedRevision: old.revision || 1 }) });
        }
        for (const old of base.tags) {
          if (!desired.tags.some((item) => item.id === old.id)) await request(`/api/tags/${encodeURIComponent(old.id)}`, { method: "DELETE", body: JSON.stringify({ expectedRevision: old.revision || 1 }) });
        }

        const refreshed = await fetch("/api/state", { headers: { Authorization: `Bearer ${token}` } });
        if (!refreshed.ok) throw new Error("同步后刷新失败");
        const remote = await refreshed.json() as AppState;
        serverSnapshot.current = remote;
        if (sameEntity(stateRef.current.projects.map(projectPayload), desired.projects.map(projectPayload)) &&
            sameEntity(stateRef.current.tags.map(tagPayload), desired.tags.map(tagPayload)) &&
            sameEntity(stateRef.current.tasks.map(taskPayload), desired.tasks.map(taskPayload))) setState(remote);
        setSync("saved");
      } catch (error) {
        setSync("error");
        const latest = await fetch("/api/state", { headers: { Authorization: `Bearer ${token}` } }).then((response) => response.ok ? response.json() as Promise<AppState> : null).catch(() => null);
        if (latest) {
          serverSnapshot.current = latest;
          if ((error as Error & { status?: number }).status === 409) {
            setState(latest);
            pushToast("数据已在其他客户端更新，已加载服务器最新版本", "info");
          }
        }
      } finally {
        syncing.current = false;
      }
    }, 700);
    return () => clearTimeout(timer);
  }, [state, ready, authReady, token, pushToast]);

  useEffect(() => {
    if (!ready || !token) return;
    const check = async () => {
      if (syncing.current) return;
      const local = stateRef.current;
      const base = serverSnapshot.current;
      if (!sameEntity(local.projects.map(projectPayload), base.projects.map(projectPayload)) ||
          !sameEntity(local.tags.map(tagPayload), base.tags.map(tagPayload)) ||
          !sameEntity(local.tasks.map(taskPayload), base.tasks.map(taskPayload))) return;
      try {
        const response = await fetch("/api/state/version", { headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok) return;
        const { dataVersion } = await response.json() as { dataVersion: number };
        if (dataVersion === (serverSnapshot.current.dataVersion || 0)) return;
        const stateResponse = await fetch("/api/state", { headers: { Authorization: `Bearer ${token}` } });
        if (!stateResponse.ok) return;
        const remote = await stateResponse.json() as AppState;
        serverSnapshot.current = remote;
        setState(remote);
        setSync("saved");
        pushToast("已同步来自其他客户端的更新", "info");
      } catch { /* 下一轮自动重试 */ }
    };
    const interval = window.setInterval(() => void check(), 5000);
    return () => window.clearInterval(interval);
  }, [ready, token, pushToast]);
  useEffect(() => setSubtaskTitle(""), [selectedId]);
  const setTask = useCallback(
    (id: string, patch: Partial<Task>) =>
      setState((current) => ({
        ...current,
        tasks: current.tasks.map((task) =>
          task.id === id ? { ...task, ...patch } : task,
        ),
      })),
    [],
  );
  const selected = state.tasks.find((task) => task.id === selectedId);
  const childTasks = selected
    ? state.tasks.filter((task) => task.parentTaskId === selected.id)
    : [];
  const completedChildCount = childTasks.filter(
    (task) => task.status === "done",
  ).length;
  const removeTaskTree = (rootId: string) => {
    setState((current) => {
      const removed = new Set([rootId]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const task of current.tasks) {
          if (
            task.parentTaskId &&
            removed.has(task.parentTaskId) &&
            !removed.has(task.id)
          ) {
            removed.add(task.id);
            changed = true;
          }
        }
      }
      return {
        ...current,
        tasks: current.tasks
          .filter((task) => !removed.has(task.id))
          .map((task) => ({
            ...task,
            dependencyIds: task.dependencyIds.filter((id) => !removed.has(id)),
          })),
      };
    });
  };
  const deleteTaskWithConfirmation = async (task: Task) => {
    const descendants = state.tasks.filter((item) => {
      let parentId = item.parentTaskId;
      while (parentId) {
        if (parentId === task.id) return true;
        parentId = state.tasks.find((candidate) => candidate.id === parentId)?.parentTaskId;
      }
      return false;
    }).length;
    const approved = await requestConfirm({
      title:`删除“${task.title}”？`,
      description:descendants ? `此操作会同时删除 ${descendants} 个子任务，并移除其他任务中相关的依赖关系。删除后无法撤销。` : "任务及其依赖关系将被永久删除，此操作无法撤销。",
      confirmLabel:"删除任务",
      danger:true,
    });
    if (!approved) return;
    removeTaskTree(task.id);
    if (selectedId === task.id) setSelectedId(undefined);
    pushToast(descendants ? `任务及 ${descendants} 个子任务已删除` : "任务已删除");
  };
  const projectOptions: SelectOption[] = [
    { value: "", label: "无项目", icon: "—" },
    ...state.projects.map((project) => ({
      value: project.id,
      label: project.name,
      color: project.color,
      meta: `${state.tasks.filter((task) => task.projectId === project.id && task.status !== "done").length} 个未完成任务`,
    })),
  ];
  const statusOptions: SelectOption[] = [
    { value: "inbox", label: "收集箱", icon: "⌄", meta: "尚未整理" },
    { value: "next", label: "下一步", icon: "→", meta: "可以立即行动" },
    {
      value: "waiting",
      label: "等待中",
      icon: "◌",
      meta: "等待他人或外部条件",
    },
    { value: "scheduled", label: "日程", icon: "□", meta: "已安排具体时间" },
    { value: "someday", label: "将来 / 也许", icon: "◇", meta: "暂不承诺执行" },
    { value: "done", label: "已完成", icon: "✓", meta: "归档为成果" },
  ];
  const contextOptions: SelectOption[] = [
    "",
    "电脑",
    "电话",
    "办公室",
    "家",
    "外出",
    "沟通",
  ].map((context) => ({
    value: context,
    label: context || "无情境",
    icon: context ? "@" : "—",
  }));
  const tagOptions: SelectOption[] = state.tags.map((tag) => ({
    value: tag.id,
    label: tag.name,
    icon: "#",
    meta: `${state.tasks.filter((task) => task.tagIds.includes(tag.id)).length} 个任务`,
  }));
  const createsCycle = (candidateId: string) => {
    const seen = new Set<string>();
    const visit = (id: string): boolean => {
      if (id === selectedId) return true;
      if (seen.has(id)) return false;
      seen.add(id);
      return (
        state.tasks.find((task) => task.id === id)?.dependencyIds || []
      ).some(visit);
    };
    return visit(candidateId);
  };
  const dependencyOptions: SelectOption[] = [
    { value: "", label: "无前置任务", icon: "—", meta: "此任务可独立开始" },
    ...state.tasks
      .filter(
        (task) =>
          task.id !== selectedId &&
          task.status !== "done" &&
          !createsCycle(task.id),
      )
      .map((task) => {
        const project = state.projects.find(
          (item) => item.id === task.projectId,
        );
        return {
          value: task.id,
          label: task.title,
          color: project?.color,
          meta: [
            project?.name,
            task.dueDate ? `截止 ${formatDate(task.dueDate)}` : "未排期",
          ]
            .filter(Boolean)
            .join(" · "),
        };
      }),
  ];
  const counts = useMemo(
    () =>
      Object.fromEntries(
        NAV.map(({ key }) => [
          key,
          state.tasks.filter((task) =>
            key === "completed"
              ? task.status === "done"
              : key === "today"
                ? task.status !== "done" &&
                  (task.dueDate === today() || task.startDate === today())
                : key === "projects"
                  ? task.status !== "done" && Boolean(task.projectId)
                  : key === "review"
                    ? task.status !== "done"
                    : task.status === key,
          ).length,
        ]),
      ),
    [state.tasks],
  );
  const visible = useMemo(
    () =>
      state.tasks.filter((task) => {
        if (
          search &&
          !`${task.title} ${task.notes} ${task.context}`
            .toLowerCase()
            .includes(search.toLowerCase())
        )
          return false;
        if (projectFilter && task.projectId !== projectFilter) return false;
        if (view === "completed") return task.status === "done";
        if (view === "today")
          return (
            task.status !== "done" &&
            (task.dueDate === today() || task.startDate === today())
          );
        if (view === "projects")
          return task.status !== "done" && Boolean(task.projectId);
        if (view === "review") return task.status !== "done";
        return task.status === view;
      }),
    [state.tasks, search, projectFilter, view],
  );
  const addTask = (event: FormEvent) => {
    event.preventDefault();
    if (!quick.trim()) return;
    const task: Task = {
      id: uid(),
      title: quick.trim(),
      notes: "",
      status:
        view === "waiting" || view === "scheduled" || view === "someday"
          ? view
          : view === "today"
            ? "next"
            : view === "completed"
              ? "done"
              : "inbox",
      context: "",
      important: false,
      startDate: view === "today" ? today() : undefined,
      dueDate: view === "today" ? today() : undefined,
      estimate: 1,
      sortOrder: state.tasks.length,
      tagIds: [],
      dependencyIds: [],
      projectId: projectFilter,
    };
    setState({ ...state, tasks: [...state.tasks, task] });
    setQuick("");
    setSelectedId(task.id);
  };
  const addSubtask = (event: FormEvent) => {
    event.preventDefault();
    if (!selected || !subtaskTitle.trim()) return;
    const child: Task = {
      id: uid(),
      parentTaskId: selected.id,
      projectId: selected.projectId,
      title: subtaskTitle.trim(),
      notes: "",
      status: "next",
      context: selected.context,
      important: false,
      estimate: 1,
      sortOrder: state.tasks.length,
      tagIds: [...selected.tagIds],
      dependencyIds: [],
    };
    setState({ ...state, tasks: [...state.tasks, child] });
    setSubtaskTitle("");
  };
  const signIn = (value: string, userEmail: string, openSmtp = false) => {
    localStorage.setItem("gtdflow-token", value);
    localStorage.setItem("gtdflow-email", userEmail);
    setToken(value);
    setEmail(userEmail);
    if (openSmtp) { setSettingsInitialTab("smtp"); setSettingsOpen(true); }
  };
  if (authConfig === undefined)
    return (
      <main className="loading">
        <div className="brand-mark">G</div>
        <span>正在准备你的工作台…</span>
      </main>
    );
  if (authConfig === null)
    return (
      <main className="loading">
        <div className="brand-mark">!</div>
        <strong>服务配置暂不可用</strong>
        <span>请检查 PostgreSQL 与应用环境变量后重试。</span>
      </main>
    );
  if (!token)
    return <AuthScreen onSession={signIn} setupRequired={Boolean(authConfig.setupRequired)} />;
  if (!ready)
    return (
      <main className="loading">
        <div className="brand-mark">G</div>
        <span>正在整理你的工作台…</span>
      </main>
    );
  const title = search
    ? `搜索“${search}”`
    : projectFilter
      ? state.projects.find((p) => p.id === projectFilter)?.name || "项目"
      : NAV.find((n) => n.key === view)?.label || "任务";
  const updatePreferences = (value: UserPreferences) => {
    setPreferences(value);
    localStorage.setItem("gtdflow-preferences", JSON.stringify(value));
  };
  const signOut = () => {
    if (token) {
      fetch("/api/auth/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => undefined);
    }
    localStorage.removeItem("gtdflow-token");
    localStorage.removeItem("gtdflow-email");
    setSettingsOpen(false);
    setToken("");
  };
  return (
    <main className={`app-shell ${selected ? "detail-open" : ""} density-${preferences.density}`}>
      <aside className={`sidebar ${navOpen ? "open" : ""}`}>
        <div className="account">
          <div className="avatar">{email[0]?.toUpperCase() || "G"}</div>
          <div>
            <strong>
              {email.split("@")[0]}
            </strong>
            <span>{email}</span>
          </div>
          <button
            onClick={signOut}
          >
            ⌄
          </button>
        </div>
        <label className="search">
          <span>⌕</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索任务、标签和备注"
          />
        </label>
        <nav>
          {NAV.map((item) => (
            <button
              key={item.key}
              className={!projectFilter && view === item.key ? "active" : ""}
              onClick={() => {
                setView(item.key);
                setProjectFilter(undefined);
                setNavOpen(false);
              }}
            >
              <i>{item.icon}</i>
              <span>{item.label}</span>
              {counts[item.key] ? <b>{counts[item.key]}</b> : null}
            </button>
          ))}
        </nav>
        <div className="projects">
          <div>
            <span>我的项目</span>
            <button
              onClick={async () => {
                const name = await requestPrompt({ title:"新建项目", description:"为一组相关行动创建清晰的结果容器。", confirmLabel:"创建项目", placeholder:"例如：新版产品发布" });
                if (!name) return;
                setState((current) => ({
                  ...current,
                  projects: [...current.projects, { id:uid(), name, color:["#69d2c8", "#a78bfa", "#f6b85a"][current.projects.length % 3] }],
                }));
                pushToast(`项目“${name}”已创建`);
              }}
            >
              ＋
            </button>
          </div>
          {state.projects.map((project) => (
            <button
              key={project.id}
              className={projectFilter === project.id ? "active" : ""}
              onClick={() => {
                setProjectFilter(project.id);
                setView("projects");
                setNavOpen(false);
              }}
            >
              <i style={{ background: project.color }} />
              <span>{project.name}</span>
              <b>
                {
                  state.tasks.filter(
                    (task) =>
                      task.projectId === project.id && task.status !== "done",
                  ).length
                }
              </b>
            </button>
          ))}
        </div>
        <div className="sidebar-foot">
          <span className={`sync ${sync}`}>
            {sync === "saving"
              ? "同步中…"
              : sync === "error"
                ? "同步失败"
                : "✓ 已同步"}
          </span>
          <button onClick={() => setSettingsOpen(true)} aria-label="打开设置" title="设置">
            ⚙
          </button>
        </div>
      </aside>
      <section className="workspace">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setNavOpen(!navOpen)}>
            ☰
          </button>
          <div>
            <span className="eyebrow">GTD FLOW</span>
            <h1>{title}</h1>
            <p>
              {visible.filter((task) => task.status !== "done").length}{" "}
              个行动等待推进
            </p>
          </div>
          <div className="view-switch">
            <button
              className={mode === "list" ? "active" : ""}
              onClick={() => setMode("list")}
            >
              ☷ 列表
            </button>
            <button
              className={mode === "gantt" ? "active" : ""}
              onClick={() => setMode("gantt")}
            >
              ▥ 甘特
            </button>
          </div>
        </header>
        {view === "review" && (
          <div className="review-banner">
            <div>
              <span>每周回顾</span>
              <strong>让系统保持可信，才能安心专注</strong>
              <p>清空收集箱 → 检查项目 → 更新等待事项 → 选择下周重点</p>
            </div>
            <button
              onClick={() => {
                setView("inbox");
                pushToast("回顾已开始：先清空收集箱，再检查项目与等待事项", "info");
              }}
            >
              开始回顾 →
            </button>
          </div>
        )}
        {mode === "list" ? (
          <div className="list-wrap">
            <div className="list-head">
              <span>{visible.length} 项</span>
              <button>排序：智能</button>
            </div>
            <div className="task-list">
              {visible.length ? (
                visible.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    active={task.id === selectedId}
                    project={state.projects.find(
                      (p) => p.id === task.projectId,
                    )}
                    stepProgress={(() => {
                      const steps = state.tasks.filter(
                        (item) => item.parentTaskId === task.id,
                      );
                      return {
                        total: steps.length,
                        done: steps.filter((item) => item.status === "done")
                          .length,
                      };
                    })()}
                    onSelect={() => setSelectedId(task.id)}
                    onToggle={() =>
                      setTask(task.id, {
                        status: task.status === "done" ? "next" : "done",
                      })
                    }
                    onImportant={() =>
                      setTask(task.id, { important: !task.important })
                    }
                    onOpenMenu={(event) => {
                      event.preventDefault();
                      setSelectedId(task.id);
                      setContextMenu({ taskId:task.id, x:event.clientX, y:event.clientY });
                    }}
                  />
                ))
              ) : (
                <div className="empty">
                  <span>✓</span>
                  <strong>这里已经清空</strong>
                  <p>专注当前最重要的下一步。</p>
                </div>
              )}
            </div>
            <form className="quick-add" onSubmit={addTask}>
              <span>＋</span>
              <input
                value={quick}
                onChange={(e) => setQuick(e.target.value)}
                placeholder="添加任务，按 Enter 保存"
              />
              <button>添加</button>
            </form>
          </div>
        ) : (
          <Gantt
            tasks={
              visible.length
                ? visible
                : state.tasks.filter((task) => task.status !== "done")
            }
            projects={state.projects}
            weekStartsOn={preferences.weekStartsOn}
            onChange={setTask}
            onSelect={setSelectedId}
          />
        )}
      </section>
      {selected && (
        <aside className="detail">
          <header>
            <button
              className={`check ${selected.status === "done" ? "checked" : ""}`}
              onClick={() =>
                setTask(selected.id, {
                  status: selected.status === "done" ? "next" : "done",
                })
              }
            >
              {selected.status === "done" ? "✓" : ""}
            </button>
            <textarea
              value={selected.title}
              onChange={(e) => setTask(selected.id, { title: e.target.value })}
              rows={2}
            />
            <button
              className={`star ${selected.important ? "on" : ""}`}
              onClick={() =>
                setTask(selected.id, { important: !selected.important })
              }
            >
              ☆
            </button>
            <button className="close" onClick={() => setSelectedId(undefined)}>
              ×
            </button>
          </header>
          <button className="ai-button" onClick={() => setAiTask(selected)}>
            <span>✦</span>
            <div>
              <strong>用 AI 拆分任务</strong>
              <small>生成步骤、工期和依赖关系</small>
            </div>
            <b>→</b>
          </button>
          <section className="steps-card">
            <header>
              <div>
                <strong>执行步骤</strong>
                <span>
                  {completedChildCount}/{childTasks.length} 已完成
                </span>
              </div>
              {childTasks.length > 0 && (
                <div className="steps-progress" aria-hidden>
                  <i
                    style={{
                      width: `${Math.round((completedChildCount / childTasks.length) * 100)}%`,
                    }}
                  />
                </div>
              )}
            </header>
            {childTasks.length > 0 && (
              <div className="steps-list">
                {childTasks.map((step) => (
                  <div className="step-item" key={step.id}>
                    <button
                      type="button"
                      className={`check ${step.status === "done" ? "checked" : ""}`}
                      aria-label={
                        step.status === "done" ? "标记步骤未完成" : "完成步骤"
                      }
                      onClick={() =>
                        setTask(step.id, {
                          status: step.status === "done" ? "next" : "done",
                        })
                      }
                    >
                      {step.status === "done" ? "✓" : ""}
                    </button>
                    <input
                      value={step.title}
                      className={step.status === "done" ? "strike" : ""}
                      onChange={(event) =>
                        setTask(step.id, { title: event.target.value })
                      }
                      aria-label="步骤标题"
                    />
                    <button
                      type="button"
                      className="step-delete"
                      aria-label="删除步骤"
                      onClick={() => void deleteTaskWithConfirmation(step)}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            <form className="step-add" onSubmit={addSubtask}>
              <span>＋</span>
              <input
                value={subtaskTitle}
                onChange={(event) => setSubtaskTitle(event.target.value)}
                placeholder={
                  childTasks.length
                    ? "添加下一步…"
                    : "添加步骤，或让 AI 自动拆分…"
                }
                aria-label="添加执行步骤"
              />
              <button disabled={!subtaskTitle.trim()}>添加</button>
            </form>
          </section>
          <section className="detail-section">
            <label>
              <span>项目</span>
              <SelectPopover
                ariaLabel="选择项目"
                value={selected.projectId || ""}
                options={projectOptions}
                onChange={(value) =>
                  setTask(selected.id, {
                    projectId: value || undefined,
                  })
                }
              />
            </label>
            <label>
              <span>状态</span>
              <SelectPopover
                ariaLabel="选择任务状态"
                value={selected.status}
                options={statusOptions}
                onChange={(value) =>
                  setTask(selected.id, { status: value as Status })
                }
              />
            </label>
            <label>
              <span>情境</span>
              <SelectPopover
                ariaLabel="选择任务情境"
                searchable
                allowCreate
                searchPlaceholder="搜索或创建情境…"
                createHint="创建新的任务情境"
                value={selected.context}
                options={
                  selected.context &&
                  !contextOptions.some(
                    (option) => option.value === selected.context,
                  )
                    ? [
                        ...contextOptions,
                        {
                          value: selected.context,
                          label: selected.context,
                          icon: "@",
                        },
                      ]
                    : contextOptions
                }
                onChange={(value) => setTask(selected.id, { context: value })}
              />
            </label>
            <label>
              <span>标签</span>
              <SelectPopover
                ariaLabel="选择任务标签"
                searchable
                multiple
                allowCreate
                multipleLabel="个标签"
                searchPlaceholder="搜索或创建标签…"
                createHint="创建新的任务标签"
                value=""
                values={selected.tagIds}
                options={tagOptions}
                onChange={() => undefined}
                onMultiChange={(values) =>
                  setTask(selected.id, { tagIds: values })
                }
                onCreate={(label) => {
                  const tagId = uid();
                  setState({
                    ...state,
                    tags: [...state.tags, { id: tagId, name: label }],
                    tasks: state.tasks.map((task) =>
                      task.id === selected.id
                        ? { ...task, tagIds: [...task.tagIds, tagId] }
                        : task,
                    ),
                  });
                }}
              />
            </label>
          </section>
          <section className="detail-section dates">
            <label>
              <span>开始日期</span>
              <input
                type="date"
                value={selected.startDate || ""}
                onChange={(e) =>
                  setTask(selected.id, {
                    startDate: e.target.value || undefined,
                  })
                }
              />
            </label>
            <label>
              <span>截止日期</span>
              <input
                type="date"
                value={selected.dueDate || ""}
                onChange={(e) =>
                  setTask(selected.id, { dueDate: e.target.value || undefined })
                }
              />
            </label>
            <label>
              <span>预计工期</span>
              <div>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={selected.estimate}
                  onChange={(e) =>
                    setTask(selected.id, {
                      estimate: Math.max(1, Number(e.target.value)),
                    })
                  }
                />
                <em>天</em>
              </div>
            </label>
          </section>
          <section className="detail-section">
            <label>
              <span>前置任务</span>
              <SelectPopover
                ariaLabel="选择前置任务"
                searchable
                multiple
                multipleLabel="个前置任务"
                searchPlaceholder="搜索任务标题或项目…"
                value=""
                values={selected.dependencyIds}
                options={dependencyOptions}
                onChange={() => undefined}
                onMultiChange={(values) =>
                  setTask(selected.id, { dependencyIds: values })
                }
              />
            </label>
          </section>
          <section className="notes">
            <span>备注</span>
            <textarea
              value={selected.notes}
              onChange={(e) => setTask(selected.id, { notes: e.target.value })}
              placeholder="补充背景、完成标准或相关信息…"
            />
          </section>
          <footer>
            <span>创建于今天</span>
            <button
              onClick={() => void deleteTaskWithConfirmation(selected)}
            >
              删除任务
            </button>
          </footer>
        </aside>
      )}
      {contextMenu && (() => {
        const menuTask = state.tasks.find((task) => task.id === contextMenu.taskId);
        return menuTask ? <TaskContextMenu task={menuTask} projects={state.projects} x={contextMenu.x} y={contextMenu.y} onPatch={(patch) => setTask(menuTask.id, patch)} onDelete={() => void deleteTaskWithConfirmation(menuTask)} onAI={() => setAiTask(menuTask)} onToast={(message) => pushToast(message)} onClose={() => setContextMenu(undefined)} /> : null;
      })()}
      {aiTask && (
        <AIModal
          task={aiTask}
          token={token}
          onClose={() => setAiTask(undefined)}
          onCommit={async (items) => {
            const response = await fetch("/api/ai/decompose/commit", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ parentTaskId: aiTask.id, items }),
            });
            const result = (await response.json()) as { error?: string };
            if (!response.ok) throw new Error(result.error || "创建子任务失败");
            const refreshed = await fetch("/api/state", {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (!refreshed.ok) throw new Error("子任务已创建，请刷新页面查看");
            const nextState = (await refreshed.json()) as AppState;
            serverSnapshot.current = nextState;
            setState(nextState);
            setAiTask(undefined);
            setMode("gantt");
            pushToast(`${items.length} 个子任务已创建`);
          }}
        />
      )}
      {settingsOpen && (
        <SettingsDrawer
          token={token}
          email={email}
          sync={sync}
          preferences={preferences}
          state={state}
          onPreferencesChange={updatePreferences}
          onClose={() => setSettingsOpen(false)}
          onSignOut={signOut}
          initialTab={settingsInitialTab}
          onConfirm={requestConfirm}
          onToast={pushToast}
        />
      )}
      {dialog && <FriendlyDialog key={dialog.id} request={dialog} onClose={() => setDialog(undefined)} />}
      {toasts.length > 0 && <ToastStack items={toasts} onDismiss={(id) => setToasts((current) => current.filter((item) => item.id !== id))} />}
    </main>
  );
}
