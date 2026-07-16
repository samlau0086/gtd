"use client";

import {
  FormEvent,
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

type Status = "inbox" | "next" | "waiting" | "scheduled" | "someday" | "done";
type Project = { id: string; name: string; color: string };
type Tag = { id: string; name: string };
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
};
type AppState = { projects: Project[]; tasks: Task[]; tags: Tag[] };
type DraftItem = {
  tempId: string;
  title: string;
  notes: string;
  estimate: number;
  startDate?: string;
  dueDate?: string;
  dependsOn: string[];
};
type AuthConfig = { url: string; key: string };
type SettingsTab = "general" | "ai" | "account" | "data";
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
  config,
  onSession,
}: {
  config: AuthConfig;
  onSession: (token: string, email: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const { url, key } = config;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      if (!sent) {
        const response = await fetch(`${url}/auth/v1/otp`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: key },
          body: JSON.stringify({ email, create_user: true }),
        });
        if (!response.ok) throw new Error("验证码发送失败，请稍后再试");
        setSent(true);
        setMessage("6 位验证码已发送，请查看邮箱");
      } else {
        const response = await fetch(`${url}/auth/v1/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: key },
          body: JSON.stringify({ email, token: code, type: "email" }),
        });
        const data = (await response.json()) as {
          access_token?: string;
          user?: { email?: string };
          msg?: string;
        };
        if (!response.ok || !data.access_token)
          throw new Error(data.msg || "验证码无效或已过期");
        onSession(data.access_token, data.user?.email || email);
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
          {!sent ? (
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
            {busy ? "请稍候…" : sent ? "进入 GTD Flow" : "发送验证码"}
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
}: {
  task: Task;
  active: boolean;
  project?: Project;
  onSelect: () => void;
  onToggle: () => void;
  onImportant: () => void;
  stepProgress?: { done: number; total: number };
}) {
  return (
    <article
      className={`task-row ${active ? "active" : ""}`}
      onClick={onSelect}
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
  onCommit: (items: DraftItem[]) => void;
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
              onClick={() => onCommit(draft)}
            >
              确认并创建 {draft.length} 项
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
}: {
  token: string;
  email: string;
  sync: "saved" | "saving" | "error";
  preferences: UserPreferences;
  state: AppState;
  onPreferencesChange: (value: UserPreferences) => void;
  onClose: () => void;
  onSignOut: () => void;
}) {
  const [tab, setTab] = useState<SettingsTab>("general");
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
    if (!token || !confirm("删除已保存的 AI 配置？删除后需重新填写密钥。"))
      return;
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
    { key: "ai", icon: "✦", label: "AI 服务" },
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
            {tab === "ai" && (
              <section className="settings-section">
                <div className="settings-title">
                  <h3>AI 服务</h3>
                  <p>连接你自己的 OpenAI 兼容模型，用于自动拆分任务。</p>
                </div>
                {!token ? (
                  <div className="settings-empty"><span>✦</span><strong>演示模式不保存模型密钥</strong><p>配置 Supabase 并登录账号后即可安全保存。</p></div>
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
  const supabaseReady = Boolean(authConfig);
  const [token, setToken] = useState("");
  const [email, setEmail] = useState("演示账户");
  const [state, setState] = useState<AppState>(() => seedState());
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<ViewKey>("today");
  const [mode, setMode] = useState<"list" | "gantt">("list");
  const [selectedId, setSelectedId] = useState<string>();
  const [search, setSearch] = useState("");
  const [quick, setQuick] = useState("");
  const [projectFilter, setProjectFilter] = useState<string>();
  const [aiTask, setAiTask] = useState<Task>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [preferences, setPreferences] = useState<UserPreferences>(() => ({
    defaultView: "today",
    weekStartsOn: "monday",
    density: "comfortable",
  }));
  const [navOpen, setNavOpen] = useState(false);
  const [sync, setSync] = useState<"saved" | "saving" | "error">("saved");
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const loaded = useRef(false);
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
    if (!supabaseReady) {
      const local = localStorage.getItem("gtdflow-demo");
      if (local)
        try {
          setState(JSON.parse(local));
        } catch {}
      setReady(true);
      loaded.current = true;
    }
  }, [authConfig, supabaseReady]);
  useEffect(() => {
    if (!supabaseReady || !token) return;
    fetch("/api/state", { headers: { Authorization: `Bearer ${token}` } })
      .then(async (r) => {
        if (r.status === 401) {
          localStorage.removeItem("gtdflow-token");
          setToken("");
          return;
        }
        if (!r.ok) throw new Error();
        const data = (await r.json()) as AppState;
        setState(
          data.tasks.length || data.projects.length ? data : seedState(),
        );
        setReady(true);
        setTimeout(() => {
          loaded.current = true;
        }, 0);
      })
      .catch(() => {
        setReady(true);
        setSync("error");
      });
  }, [supabaseReady, token]);
  useEffect(() => {
    if (!ready || !loaded.current) return;
    if (!supabaseReady) {
      localStorage.setItem("gtdflow-demo", JSON.stringify(state));
      return;
    }
    if (!token) return;
    setSync("saving");
    const timer = setTimeout(
      () =>
        fetch("/api/state", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(state),
        })
          .then((r) => {
            if (!r.ok) throw new Error();
            setSync("saved");
          })
          .catch(() => setSync("error")),
      700,
    );
    return () => clearTimeout(timer);
  }, [state, ready, supabaseReady, token]);
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
  const signIn = (value: string, userEmail: string) => {
    localStorage.setItem("gtdflow-token", value);
    localStorage.setItem("gtdflow-email", userEmail);
    setToken(value);
    setEmail(userEmail);
  };
  if (authConfig === undefined)
    return (
      <main className="loading">
        <div className="brand-mark">G</div>
        <span>正在准备你的工作台…</span>
      </main>
    );
  if (supabaseReady && !token)
    return <AuthScreen config={authConfig!} onSession={signIn} />;
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
              {email === "演示账户" ? "GTD Flow 演示" : email.split("@")[0]}
            </strong>
            <span>{email}</span>
          </div>
          <button
            onClick={() => {
              if (supabaseReady) {
                localStorage.removeItem("gtdflow-token");
                setToken("");
              }
            }}
          >
            ⌄
          </button>
        </div>
        {!supabaseReady && (
          <div className="demo-badge">
            <b>演示模式</b>
            <span>配置 Supabase 后自动切换云同步</span>
          </div>
        )}
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
              onClick={() => {
                const name = prompt("项目名称");
                if (name)
                  setState({
                    ...state,
                    projects: [
                      ...state.projects,
                      {
                        id: uid(),
                        name,
                        color: ["#69d2c8", "#a78bfa", "#f6b85a"][
                          state.projects.length % 3
                        ],
                      },
                    ],
                  });
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
                alert("从清空收集箱开始。完成后依次检查项目与等待事项。");
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
                      onClick={() => removeTaskTree(step.id)}
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
              onClick={() => {
                removeTaskTree(selected.id);
                setSelectedId(undefined);
              }}
            >
              删除任务
            </button>
          </footer>
        </aside>
      )}
      {aiTask && (
        <AIModal
          task={aiTask}
          token={token}
          onClose={() => setAiTask(undefined)}
          onCommit={(items) => {
            const ids = new Map(items.map((item) => [item.tempId, uid()]));
            const created: Task[] = items.map((item, index) => ({
              id: ids.get(item.tempId)!,
              parentTaskId: aiTask.id,
              projectId: aiTask.projectId,
              title: item.title,
              notes: item.notes,
              status: "next",
              context: aiTask.context,
              important: false,
              startDate: item.startDate,
              dueDate: item.dueDate,
              estimate: item.estimate,
              sortOrder: state.tasks.length + index,
              tagIds: [...aiTask.tagIds],
              dependencyIds: item.dependsOn
                .map((id) => ids.get(id))
                .filter(Boolean) as string[],
            }));
            setState({ ...state, tasks: [...state.tasks, ...created] });
            setAiTask(undefined);
            setMode("gantt");
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
        />
      )}
    </main>
  );
}
