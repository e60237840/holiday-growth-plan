"use client";

import {
  Award,
  BarChart3,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  CirclePause,
  CirclePlay,
  Clock3,
  Copy,
  Download,
  Dumbbell,
  Gamepad2,
  Gift,
  Heart,
  Home,
  LogOut,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCcw,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { FormEvent, ReactNode, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createDemoData } from "../lib/demo-data";
import { initializeSupabase, isSupabaseConfigured, supabase } from "../lib/supabase";
import type {
  AppData,
  DailyReview,
  GameRecord,
  GrowthTask,
  Profile,
  Redemption,
  RepeatType,
  Reward,
  TaskCategory,
} from "../lib/types";

type NavKey = "today" | "plan" | "rewards" | "records" | "settings";
type AppMode = "child" | "parent";
type ModalName = "task" | "reward" | "pin" | "points" | "game" | "approval" | "penalty" | null;

const CATEGORIES: TaskCategory[] = ["学习", "阅读", "运动", "兴趣", "家务", "生活", "娱乐", "其他"];
const REWARD_CATEGORIES = ["游戏", "娱乐", "食物", "物品", "亲子活动", "自由选择", "其他"];
const TODAY = () => new Date().toLocaleDateString("en-CA");

const navItems: { key: NavKey; label: string; icon: typeof Home }[] = [
  { key: "today", label: "今日", icon: Home },
  { key: "plan", label: "计划", icon: CalendarDays },
  { key: "rewards", label: "奖励", icon: Gift },
  { key: "records", label: "记录", icon: BarChart3 },
  { key: "settings", label: "设置", icon: Settings },
];

const categoryMeta: Record<TaskCategory, { icon: typeof BookOpen; tone: string }> = {
  学习: { icon: BookOpen, tone: "blue" },
  阅读: { icon: BookOpen, tone: "purple" },
  运动: { icon: Dumbbell, tone: "green" },
  兴趣: { icon: Sparkles, tone: "orange" },
  家务: { icon: Home, tone: "teal" },
  生活: { icon: Heart, tone: "rose" },
  娱乐: { icon: Gamepad2, tone: "indigo" },
  其他: { icon: MoreHorizontal, tone: "gray" },
};

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function withTimeout<T>(promise: PromiseLike<T>, timeoutMs: number, message: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const rejection = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([Promise.resolve(promise), rejection]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}

// Some embedded and older browsers do not expose crypto.randomUUID yet.
function makeId() {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function configuredSupabase() {
  if (!supabase) throw new Error("Supabase is not configured");
  return supabase;
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "long" }).format(date);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatClock(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0
    ? `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function getGameAvailableMinutes(profile: Profile, game: GameRecord) {
  return Math.max(0, Math.min(profile.max_game_minutes, game.base_minutes + game.earned_minutes) + game.manual_adjustment);
}

function getLiveUsedSeconds(game: GameRecord, now: number) {
  const running = game.timer_status === "计时中" && game.timer_started_at
    ? Math.max(0, Math.floor((now - new Date(game.timer_started_at).getTime()) / 1000))
    : 0;
  return game.used_seconds + running;
}

function getWeekDates() {
  const current = new Date();
  const day = current.getDay() || 7;
  const monday = new Date(current);
  monday.setDate(current.getDate() - day + 1);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return date.toLocaleDateString("en-CA");
  });
}

export default function HolidayGrowthApp() {
  const isClient = useSyncExternalStore(() => () => undefined, () => true, () => false);
  const [activeNav, setActiveNav] = useState<NavKey>("today");
  const [mode, setMode] = useState<AppMode>("child");
  const [modal, setModal] = useState<ModalName>(null);
  const [editingTask, setEditingTask] = useState<GrowthTask | null>(null);
  const [approvingTask, setApprovingTask] = useState<GrowthTask | null>(null);
  const [penalizingTask, setPenalizingTask] = useState<GrowthTask | null>(null);
  const [editingReward, setEditingReward] = useState<Reward | null>(null);
  const [data, setData] = useState<AppData | null>(null);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [startupError, setStartupError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2800);
  }, []);

  const loadData = useCallback(async (userId: string | null) => {
    if (!isSupabaseConfigured || !supabase) {
      setData((current) => current ?? createDemoData());
      setLoading(false);
      return;
    }
    const id = userId;
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const { error: profileError } = await withTimeout(supabase.from("profiles").upsert({ user_id: id }, { onConflict: "user_id", ignoreDuplicates: true }), 12000, "profile request timed out");
      if (profileError) throw profileError;
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai";
      const { error: timezoneError } = await withTimeout(supabase.from("profiles").update({ timezone }).eq("user_id", id), 12000, "timezone request timed out");
      if (timezoneError) throw timezoneError;
      const { error: gameError } = await withTimeout(supabase.rpc("ensure_today_game_record"), 12000, "game record request timed out");
      if (gameError) throw gameError;
      const today = TODAY();
      const weekStart = getWeekDates()[0];
      const [profileResult, tasksResult, pointsResult, rewardsResult, redemptionsResult, gameResult, gameHistoryResult, reviewsResult] = await withTimeout(Promise.all([
        supabase.from("profiles").select("id,user_id,child_name,avatar_url,holiday_start,holiday_end,timezone,stars_balance,base_game_minutes,max_game_minutes,require_tasks_before_game,streak_reward,daily_points_cap,parent_pin_set,holiday_goals").eq("user_id", id).single(),
        supabase.from("tasks").select("*").eq("user_id", id).gte("task_date", weekStart).order("task_date").order("start_time"),
        supabase.from("point_transactions").select("*").eq("user_id", id).order("created_at", { ascending: false }).limit(100),
        supabase.from("rewards").select("*").eq("user_id", id).order("created_at", { ascending: false }),
        supabase.from("reward_redemptions").select("*").eq("user_id", id).order("requested_at", { ascending: false }).limit(100),
        supabase.from("game_time_records").select("*").eq("user_id", id).eq("record_date", today).single(),
        supabase.from("game_time_records").select("*").eq("user_id", id).gte("record_date", weekStart).order("record_date"),
        supabase.from("daily_reviews").select("*").eq("user_id", id).gte("review_date", weekStart).order("review_date", { ascending: false }),
      ]), 15000, "family data request timed out");
      const firstError = [profileResult, tasksResult, pointsResult, rewardsResult, redemptionsResult, gameResult, gameHistoryResult, reviewsResult].find((result) => result.error)?.error;
      if (firstError) throw firstError;
      if (!profileResult.data || !gameResult.data) throw new Error("Missing profile or game record");
      setData({
        profile: { ...profileResult.data, holiday_goals: profileResult.data.holiday_goals ?? [] } as Profile,
        tasks: (tasksResult.data ?? []) as GrowthTask[],
        points: pointsResult.data ?? [],
        rewards: rewardsResult.data ?? [],
        redemptions: redemptionsResult.data ?? [],
        game: gameResult.data as GameRecord,
        gameHistory: (gameHistoryResult.data ?? []) as GameRecord[],
        reviews: reviewsResult.data ?? [],
      });
    } catch (cause) {
      console.error(cause);
      setError("云端数据加载失败或响应超时，请检查手机网络后重新加载。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;

    async function startAuthentication() {
      try {
        const configured = await withTimeout(initializeSupabase(), 10000, "Supabase configuration timed out");
        if (!active) return;
        const client = supabase;

        if (!configured || !client) {
          setData((current) => current ?? createDemoData());
          setLoading(false);
          setAuthReady(true);
          return;
        }

        const { data: authData, error: authError } = await withTimeout(client.auth.getSession(), 10000, "Login session request timed out");
        if (!active) return;
        if (authError) throw authError;
        const id = authData.session?.user.id ?? null;
        setSessionUserId(id);
        setAuthReady(true);
        if (id) void loadData(id);
        else setLoading(false);

        const { data: listener } = client.auth.onAuthStateChange((_event, session) => {
          if (!active) return;
          const nextId = session?.user.id ?? null;
          setSessionUserId(nextId);
          if (nextId) void loadData(nextId);
          else {
            setData(null);
            setLoading(false);
          }
        });
        unsubscribe = () => listener.subscription.unsubscribe();
      } catch (cause) {
        console.error(cause);
        if (!active) return;
        setStartupError("登录和云端数据初始化超时。请检查手机网络，然后重新加载页面。");
        setLoading(false);
        setAuthReady(true);
      }
    }

    void startAuthentication();
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [loadData]);

  useEffect(() => {
    const client = supabase;
    if (!client || !sessionUserId) return;
    const scheduleRefresh = () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => void loadData(sessionUserId), 350);
    };
    const channel = client
      .channel(`growth-${sessionUserId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles", filter: `user_id=eq.${sessionUserId}` }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `user_id=eq.${sessionUserId}` }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "point_transactions", filter: `user_id=eq.${sessionUserId}` }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "rewards", filter: `user_id=eq.${sessionUserId}` }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "reward_redemptions", filter: `user_id=eq.${sessionUserId}` }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "game_time_records", filter: `user_id=eq.${sessionUserId}` }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "daily_reviews", filter: `user_id=eq.${sessionUserId}` }, scheduleRefresh)
      .subscribe();
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      void client.removeChannel(channel);
    };
  }, [loadData, sessionUserId]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  async function runRemote(action: () => PromiseLike<{ error: unknown }>, success: string) {
    setError(null);
    const result = await action();
    if (result.error) {
      console.error(result.error);
      setError("操作没有成功，请稍后重试。若问题持续，请检查数据库脚本是否已完整执行。");
      return false;
    }
    notify(success);
    await loadData(sessionUserId);
    return true;
  }

  function updateDemo(mutator: (current: AppData) => AppData, success: string) {
    setData((current) => current ? mutator(current) : current);
    notify(success);
  }

  async function submitTask(task: GrowthTask) {
    if (!isSupabaseConfigured || !supabase) {
      updateDemo((current) => ({ ...current, tasks: current.tasks.map((item) => item.id === task.id ? { ...item, status: item.require_parent_approval ? "待家长确认" : "已完成", completed_at: new Date().toISOString(), reward_granted: !item.require_parent_approval } : item) }), task.require_parent_approval ? "已提交，等待家长确认" : "任务完成，真棒！");
      return;
    }
    await runRemote(() => configuredSupabase().rpc("submit_task_completion", { p_task_id: task.id }), task.require_parent_approval ? "已提交，等待家长确认" : "任务完成，奖励已到账");
  }

  async function approveTask(task: GrowthTask, awardedStars: number, reason: string) {
    const requestedStars = Math.max(0, Math.min(task.star_reward, Math.floor(awardedStars)));
    if (!isSupabaseConfigured || !supabase) {
      if (task.reward_granted) return;
      const todayEarned = data?.points
        .filter((point) => point.amount > 0 && point.created_at.slice(0, 10) === TODAY())
        .reduce((sum, point) => sum + point.amount, 0) ?? 0;
      const actualStars = Math.min(requestedStars, Math.max((data?.profile.daily_points_cap ?? requestedStars) - todayEarned, 0));
      const adjustmentNote = requestedStars < task.star_reward ? reason.trim() : null;
      updateDemo((current) => ({
        ...current,
        profile: { ...current.profile, stars_balance: current.profile.stars_balance + actualStars },
        tasks: current.tasks.map((item) => item.id === task.id ? { ...item, status: "已完成", approved_at: new Date().toISOString(), reward_granted: true, star_awarded: actualStars, parent_note: adjustmentNote } : item),
        game: { ...current.game, earned_minutes: Math.min(current.profile.max_game_minutes - current.game.base_minutes, current.game.earned_minutes + task.game_minutes_reward) },
        points: actualStars > 0 ? [{ id: makeId(), user_id: "demo-user", task_id: task.id, amount: actualStars, reason: adjustmentNote ? `${task.title}（原定 ${task.star_reward} 星，实际 ${actualStars} 星：${adjustmentNote}）` : task.title, transaction_type: "完成任务奖励", operator: "家长", balance_after: current.profile.stars_balance + actualStars, created_at: new Date().toISOString() }, ...current.points] : current.points,
      }), `已确认，实际发放 ${actualStars} 颗星星`);
      setModal(null);
      setApprovingTask(null);
      return;
    }
    if (await runRemote(() => configuredSupabase().rpc("approve_task", { p_task_id: task.id, p_awarded_stars: requestedStars, p_reason: reason.trim() || null }), `已确认，申请发放 ${requestedStars} 颗星星`)) {
      setModal(null);
      setApprovingTask(null);
    }
  }

  async function rejectTask(task: GrowthTask) {
    if (!isSupabaseConfigured || !supabase) {
      updateDemo((current) => ({ ...current, tasks: current.tasks.map((item) => item.id === task.id ? { ...item, status: "未完成", parent_note: "请完成后重新提交" } : item) }), "已退回任务");
      return;
    }
    await runRemote(() => configuredSupabase().rpc("reject_task_completion", { p_task_id: task.id, p_note: "请完成后重新提交" }), "已退回任务");
  }

  async function penalizeTask(task: GrowthTask, result: "未完成" | "未达标", reason: string) {
    if (!data || task.penalty_applied || task.status === "已完成") return;
    if (!isSupabaseConfigured || !supabase) {
      const deducted = Math.min(task.star_penalty, data.profile.stars_balance);
      const balance = data.profile.stars_balance - deducted;
      updateDemo((current) => ({
        ...current,
        profile: { ...current.profile, stars_balance: balance },
        tasks: current.tasks.map((item) => item.id === task.id ? { ...item, status: "未完成", parent_note: reason, penalty_applied: true, penalized_at: new Date().toISOString() } : item),
        points: deducted > 0 ? [{ id: makeId(), user_id: "demo-user", task_id: task.id, amount: -deducted, reason: `${result}：${reason}`, transaction_type: "任务未完成扣除", operator: "家长", balance_after: balance, created_at: new Date().toISOString() }, ...current.points] : current.points,
      }), deducted > 0 ? `已扣除 ${deducted} 颗星星` : "当前星星为 0，已记录任务结果");
      setModal(null);
      setPenalizingTask(null);
      return;
    }
    if (await runRemote(() => configuredSupabase().rpc("penalize_task", { p_task_id: task.id, p_result: result, p_reason: reason }), "任务结果已记录，星星已按规则扣除")) {
      setModal(null);
      setPenalizingTask(null);
    }
  }

  async function saveTasks(payload: Partial<GrowthTask>, editing: GrowthTask | null) {
    if (!data) return;
    if (!editing && payload.repeat_type === "每周指定日期" && !payload.weekdays?.length) {
      notify("请至少选择一个重复日期");
      return;
    }
    if (!isSupabaseConfigured || !supabase) {
      const generated = createTaskInstances(payload, editing?.id ?? null, data.profile);
      updateDemo((current) => ({ ...current, tasks: editing ? current.tasks.map((task) => task.id === editing.id ? { ...task, ...payload } as GrowthTask : task) : [...current.tasks, ...generated] }), editing ? "任务已更新" : `已创建 ${generated.length} 个任务`);
      setModal(null);
      return;
    }
    if (editing) {
      const clean = cleanTaskPayload(payload);
      if (await runRemote(() => configuredSupabase().from("tasks").update(clean).eq("id", editing.id), "任务已更新")) setModal(null);
      return;
    }
    const rows = createTaskInstances(payload, null, data.profile).map((row) => ({ ...cleanTaskPayload(row), user_id: sessionUserId }));
    if (await runRemote(() => configuredSupabase().from("tasks").insert(rows), `已创建 ${rows.length} 个任务`)) setModal(null);
  }

  async function patchTask(task: GrowthTask, patch: Partial<GrowthTask>, success: string) {
    if (!isSupabaseConfigured || !supabase) {
      updateDemo((current) => ({ ...current, tasks: current.tasks.map((item) => item.id === task.id ? { ...item, ...patch } : item) }), success);
      return;
    }
    await runRemote(() => configuredSupabase().from("tasks").update(cleanTaskPayload(patch)).eq("id", task.id), success);
  }

  async function deleteTask(task: GrowthTask) {
    if (!window.confirm(`确定删除“${task.title}”吗？此操作不能撤销。`)) return;
    if (!isSupabaseConfigured || !supabase) {
      updateDemo((current) => ({ ...current, tasks: current.tasks.filter((item) => item.id !== task.id) }), "任务已删除");
      return;
    }
    await runRemote(() => configuredSupabase().from("tasks").delete().eq("id", task.id), "任务已删除");
  }

  async function duplicateTask(task: GrowthTask) {
    const copy = { ...task, id: makeId(), title: `${task.title}（副本）`, status: "未开始" as const, reward_granted: false, star_awarded: null, penalty_applied: false, penalized_at: null, completed_at: null, approved_at: null, parent_note: null };
    if (!isSupabaseConfigured || !supabase) {
      updateDemo((current) => ({ ...current, tasks: [...current.tasks, copy] }), "任务已复制");
      return;
    }
    await runRemote(() => configuredSupabase().from("tasks").insert({ ...cleanTaskPayload(copy), user_id: sessionUserId }), "任务已复制");
  }

  async function postponeTask(task: GrowthTask) {
    const date = new Date(`${task.task_date}T12:00:00`);
    date.setDate(date.getDate() + 1);
    await patchTask(task, { task_date: date.toLocaleDateString("en-CA"), status: "未开始" }, "任务已顺延到明天");
  }

  async function saveReward(payload: Partial<Reward>, editing: Reward | null) {
    if (!isSupabaseConfigured || !supabase) {
      const next: Reward = { id: editing?.id ?? makeId(), user_id: "demo-user", title: payload.title!, description: payload.description ?? "", cost: Number(payload.cost), category: payload.category ?? "其他", icon: payload.icon ?? "🎁", is_active: payload.is_active ?? true, stock: payload.stock ?? null };
      updateDemo((current) => ({ ...current, rewards: editing ? current.rewards.map((item) => item.id === editing.id ? next : item) : [next, ...current.rewards] }), editing ? "奖励已更新" : "奖励已创建");
      setModal(null);
      return;
    }
    const client = configuredSupabase();
    const query = editing
      ? client.from("rewards").update(payload).eq("id", editing.id)
      : client.from("rewards").insert({ ...payload, user_id: sessionUserId });
    if (await runRemote(() => query, editing ? "奖励已更新" : "奖励已创建")) setModal(null);
  }

  async function deleteReward(reward: Reward) {
    if (!window.confirm(`确定删除“${reward.title}”吗？已有兑换记录时会自动停用，而不会破坏历史。`)) return;
    if (!isSupabaseConfigured || !supabase) {
      const hasHistory = data?.redemptions.some((item) => item.reward_id === reward.id);
      updateDemo((current) => ({ ...current, rewards: hasHistory ? current.rewards.map((item) => item.id === reward.id ? { ...item, is_active: false } : item) : current.rewards.filter((item) => item.id !== reward.id) }), hasHistory ? "奖励已有记录，已改为停用" : "奖励已删除");
      return;
    }
    await runRemote(() => configuredSupabase().rpc("delete_or_disable_reward", { p_reward_id: reward.id }), "奖励已处理");
  }

  async function requestReward(reward: Reward) {
    if (!data || data.profile.stars_balance < reward.cost) return notify("星星还不够，再完成几个任务吧");
    if (!isSupabaseConfigured || !supabase) {
      const redemption: Redemption = { id: makeId(), user_id: "demo-user", reward_id: reward.id, cost: reward.cost, status: "待审核", requested_at: new Date().toISOString(), approved_at: null, fulfilled_at: null, parent_note: null };
      updateDemo((current) => ({ ...current, redemptions: [redemption, ...current.redemptions] }), "兑换申请已提交");
      return;
    }
    await runRemote(() => configuredSupabase().rpc("request_reward_redemption", { p_reward_id: reward.id }), "兑换申请已提交");
  }

  async function reviewRedemption(redemption: Redemption, decision: "approve" | "reject") {
    if (!isSupabaseConfigured || !supabase) {
      if (decision === "approve" && data && data.profile.stars_balance < redemption.cost) return notify("当前星星不足，不能批准");
      updateDemo((current) => {
        const balance = current.profile.stars_balance - redemption.cost;
        const reward = current.rewards.find((item) => item.id === redemption.reward_id);
        return {
          ...current,
          profile: decision === "approve" ? { ...current.profile, stars_balance: balance } : current.profile,
          rewards: decision === "approve"
            ? current.rewards.map((item) => item.id === redemption.reward_id && item.stock !== null ? { ...item, stock: Math.max(0, item.stock - 1) } : item)
            : current.rewards,
          redemptions: current.redemptions.map((item) => item.id === redemption.id ? { ...item, status: decision === "approve" ? "待兑现" : "已拒绝", approved_at: decision === "approve" ? new Date().toISOString() : null } : item),
          points: decision === "approve"
            ? [{ id: makeId(), user_id: "demo-user", task_id: null, amount: -redemption.cost, reason: `兑换奖励：${reward?.title ?? "奖励"}`, transaction_type: "奖励兑换", operator: "家长", balance_after: balance, created_at: new Date().toISOString() }, ...current.points]
            : current.points,
        };
      }, decision === "approve" ? "兑换已批准，星星已扣除" : "兑换已拒绝，不会扣除星星");
      return;
    }
    await runRemote(() => configuredSupabase().rpc("review_reward_redemption", { p_redemption_id: redemption.id, p_decision: decision, p_note: null }), decision === "approve" ? "兑换已批准，星星已扣除" : "兑换已拒绝，不会扣除星星");
  }

  async function fulfillRedemption(redemption: Redemption) {
    if (!isSupabaseConfigured || !supabase) {
      updateDemo((current) => ({ ...current, redemptions: current.redemptions.map((item) => item.id === redemption.id ? { ...item, status: "已完成", fulfilled_at: new Date().toISOString() } : item) }), "奖励已兑现");
      return;
    }
    await runRemote(() => configuredSupabase().rpc("fulfill_reward_redemption", { p_redemption_id: redemption.id }), "奖励已兑现");
  }

  async function gameAction(action: "start" | "pause" | "stop") {
    if (!data) return;
    if (!isSupabaseConfigured || !supabase) {
      const elapsed = data.game.timer_started_at ? Math.max(0, Math.floor((Date.now() - new Date(data.game.timer_started_at).getTime()) / 1000)) : 0;
      updateDemo((current) => ({ ...current, game: action === "start"
        ? { ...current.game, timer_started_at: new Date().toISOString(), timer_status: "计时中" }
        : { ...current.game, used_seconds: current.game.used_seconds + elapsed, timer_started_at: null, timer_status: action === "pause" ? "已暂停" : "已结束" }
      }), action === "start" ? "游戏计时已开始" : action === "pause" ? "计时已暂停" : "本次游戏已结束");
      return;
    }
    await runRemote(() => configuredSupabase().rpc(`${action}_game_timer`), action === "start" ? "游戏计时已开始" : action === "pause" ? "计时已暂停" : "本次游戏已结束");
  }

  async function adjustPoints(amount: number, reason: string) {
    if (!data) return;
    if (!isSupabaseConfigured || !supabase) {
      const next = Math.max(0, data.profile.stars_balance + amount);
      if (next !== data.profile.stars_balance + amount) return notify("积分不能小于零");
      updateDemo((current) => ({ ...current, profile: { ...current.profile, stars_balance: next }, points: [{ id: makeId(), user_id: "demo-user", task_id: null, amount, reason, transaction_type: amount >= 0 ? "家长手动奖励" : "家长扣除", operator: "家长", balance_after: next, created_at: new Date().toISOString() }, ...current.points] }), "星星已调整");
      setModal(null);
      return;
    }
    if (await runRemote(() => configuredSupabase().rpc("adjust_points", { p_amount: amount, p_reason: reason }), "星星已调整")) setModal(null);
  }

  async function adjustGame(minutes: number, reason: string) {
    if (!isSupabaseConfigured || !supabase) {
      updateDemo((current) => ({ ...current, game: { ...current.game, manual_adjustment: current.game.manual_adjustment + minutes } }), `游戏时间已调整：${reason}`);
      setModal(null);
      return;
    }
    if (await runRemote(() => configuredSupabase().rpc("adjust_game_time", { p_minutes: minutes, p_reason: reason }), "游戏时间已调整")) setModal(null);
  }

  async function saveReview(review: DailyReview) {
    if (!isSupabaseConfigured || !supabase) {
      updateDemo((current) => ({ ...current, reviews: [review, ...current.reviews.filter((item) => item.review_date !== review.review_date)] }), "今日记录已保存");
      return;
    }
    await runRemote(() => configuredSupabase().from("daily_reviews").upsert({ ...review, user_id: sessionUserId }, { onConflict: "user_id,review_date" }), "今日记录已保存");
  }

  async function saveProfile(patch: Partial<Profile>) {
    if (!isSupabaseConfigured || !supabase) {
      updateDemo((current) => ({ ...current, profile: { ...current.profile, ...patch } }), "设置已保存");
      return;
    }
    await runRemote(() => configuredSupabase().from("profiles").update(patch).eq("user_id", sessionUserId!), "设置已保存");
  }

  async function verifyPin(pin: string) {
    if (!data) return;
    if (!data.profile.parent_pin_set) {
      if (!/^\d{4}$/.test(pin)) return notify("请输入四位数字密码");
      if (!isSupabaseConfigured || !supabase) {
        updateDemo((current) => ({ ...current, profile: { ...current.profile, parent_pin_set: true } }), "管理密码已创建");
      } else {
        const { error: setupError } = await configuredSupabase().rpc("set_parent_pin", { p_pin: pin });
        if (setupError) return notify("管理密码设置失败，请稍后重试");
        await loadData(sessionUserId);
      }
      setMode("parent");
      setModal(null);
      notify("管理密码已创建，已进入家长模式");
      return;
    }
    if (!isSupabaseConfigured || !supabase) {
      if (pin !== "1234") return notify("管理密码不正确");
      setMode("parent");
      setModal(null);
      notify("已进入家长模式");
      return;
    }
    const { data: valid, error: pinError } = await configuredSupabase().rpc("verify_parent_pin", { p_pin: pin });
    if (pinError || !valid) return notify("管理密码不正确");
    setMode("parent");
    setModal(null);
    notify("已进入家长模式");
  }

  async function setPin(pin: string) {
    if (!/^\d{4}$/.test(pin)) return notify("请输入四位数字密码");
    if (!isSupabaseConfigured || !supabase) {
      updateDemo((current) => ({ ...current, profile: { ...current.profile, parent_pin_set: true } }), "管理密码已设置（演示密码仍为 1234）");
      return;
    }
    await runRemote(() => configuredSupabase().rpc("set_parent_pin", { p_pin: pin }), "管理密码已设置");
  }

  async function resetData(kind: "today" | "stars" | "game" | "all", pin: string) {
    const labels = { today: "今日任务状态", stars: "星星余额", game: "今日游戏时间", all: "全部家庭数据" };
    const warning = kind === "all"
      ? "这会删除任务、奖励、兑换、积分流水、游戏记录和复盘，只保留账号。确定继续吗？"
      : `确定重置${labels[kind]}吗？`;
    if (!window.confirm(warning)) return;
    if (kind === "all" && !window.confirm("最后确认：清空后无法恢复。仍然继续吗？")) return;
    if (!isSupabaseConfigured || !supabase) {
      if (pin !== "1234") return notify("管理密码不正确");
      if (kind === "all") setData(createDemoData());
      else if (kind === "stars") updateDemo((current) => ({ ...current, profile: { ...current.profile, stars_balance: 0 } }), "星星余额已重置，任务和奖励仍保留");
      else if (kind === "game") updateDemo((current) => ({ ...current, game: { ...current.game, earned_minutes: 0, manual_adjustment: 0, used_seconds: 0, timer_started_at: null, timer_status: "未开始" } }), "游戏时间已重置");
      else updateDemo((current) => ({ ...current, tasks: current.tasks.map((task) => task.task_date === TODAY() ? { ...task, status: "未开始", completed_at: null, approved_at: null } : task) }), "今日任务状态已重置");
      return;
    }
    await runRemote(() => configuredSupabase().rpc("reset_family_data", { p_kind: kind, p_pin: pin }), `${labels[kind]}已重置`);
  }

  function exportData() {
    if (!data) return;
    const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), ...data }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `假期成长计划-${TODAY()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    notify("数据文件已导出");
  }

  if (!isClient || (!authReady && !startupError) || (loading && !data && !startupError)) return <LoadingScreen />;
  if (startupError) return <StartupErrorScreen message={startupError} />;
  if (isSupabaseConfigured && !sessionUserId) return <AuthScreen />;
  if (!data) return <StartupErrorScreen message={error ?? "云端数据没有成功加载，请重新尝试。"} />;

  const todayTasks = data.tasks.filter((task) => task.task_date === TODAY() && task.is_active);
  const completed = todayTasks.filter((task) => task.status === "已完成").length;
  const progress = todayTasks.length ? Math.round((completed / todayTasks.length) * 100) : 0;
  const liveUsed = getLiveUsedSeconds(data.game, now);
  const availableSeconds = getGameAvailableMinutes(data.profile, data.game) * 60;
  const remainingSeconds = Math.max(0, availableSeconds - liveUsed);

  const content = activeNav === "today" ? (
    <TodayView data={data} mode={mode} tasks={todayTasks} progress={progress} remainingSeconds={remainingSeconds} onSubmitTask={submitTask} onApproveTask={(task) => { setApprovingTask(task); setModal("approval"); }} onRejectTask={rejectTask} onPenalizeTask={(task) => { setPenalizingTask(task); setModal("penalty"); }} onGameAction={gameAction} onAdjustGame={() => setModal("game")} />
  ) : activeNav === "plan" ? (
    <PlanView data={data} mode={mode} onAdd={() => { setEditingTask(null); setModal("task"); }} onEdit={(task) => { setEditingTask(task); setModal("task"); }} onDelete={deleteTask} onDuplicate={duplicateTask} onPostpone={postponeTask} onToggle={(task) => patchTask(task, { is_active: !task.is_active }, task.is_active ? "任务已停用" : "任务已启用")} onSaveGoals={(goals) => saveProfile({ holiday_goals: goals })} />
  ) : activeNav === "rewards" ? (
    <RewardsView data={data} mode={mode} onAdd={() => { setEditingReward(null); setModal("reward"); }} onEdit={(reward) => { setEditingReward(reward); setModal("reward"); }} onDelete={deleteReward} onRequest={requestReward} onReview={reviewRedemption} onFulfill={fulfillRedemption} />
  ) : activeNav === "records" ? (
    <RecordsView key={data.reviews.find((review) => review.review_date === TODAY())?.id ?? "new-review"} data={data} mode={mode} onSaveReview={saveReview} />
  ) : (
    <SettingsView key={`${data.profile.child_name}-${data.profile.base_game_minutes}-${data.profile.max_game_minutes}-${data.profile.daily_points_cap}`} data={data} mode={mode} isDemo={!isSupabaseConfigured} onSaveProfile={saveProfile} onSetPin={setPin} onAdjustPoints={() => setModal("points")} onExport={exportData} onReset={resetData} onSignOut={() => supabase?.auth.signOut()} />
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <nav className="side-nav" aria-label="主要导航">
          {navItems.map((item) => <NavButton key={item.key} item={item} active={activeNav === item.key} onClick={() => setActiveNav(item.key)} />)}
        </nav>
        <div className="side-profile">
          <Avatar name={data.profile.child_name} url={data.profile.avatar_url} />
          <div><strong>{data.profile.child_name || "孩子"}</strong><span>{mode === "parent" ? "家长模式" : "孩子模式"}</span></div>
          <button className="icon-button" aria-label="切换模式" onClick={() => mode === "parent" ? (setMode("child"), notify("已切换到孩子模式")) : setModal("pin")}><ShieldCheck size={18} /></button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div>
            <p className="eyebrow">{formatDate(new Date())}</p>
            <h1>{activeNav === "today" ? `早上好，${data.profile.child_name || "小朋友"}` : navItems.find((item) => item.key === activeNav)?.label}</h1>
          </div>
          <div className="topbar-actions">
            {!isSupabaseConfigured && <span className="demo-badge">演示模式</span>}
            <button className={cn("mode-switch", mode === "parent" && "parent")} onClick={() => mode === "parent" ? (setMode("child"), notify("已切换到孩子模式")) : setModal("pin")}>
              {mode === "parent" ? <ShieldCheck size={17} /> : <UserRound size={17} />}{mode === "parent" ? "家长模式" : "孩子模式"}<ChevronRight size={16} />
            </button>
          </div>
        </header>
        {error && <div className="error-banner" role="alert"><span>{error}</span><button onClick={() => void loadData(sessionUserId)}><RefreshCcw size={16} />重试</button></div>}
        <div className="page-content">{content}</div>
      </main>

      <nav className="bottom-nav" aria-label="手机端导航">
        {navItems.map((item) => <NavButton key={item.key} item={item} active={activeNav === item.key} onClick={() => setActiveNav(item.key)} />)}
      </nav>

      {modal === "task" && <Modal title={editingTask ? "修改任务" : "创建任务"} onClose={() => setModal(null)}><TaskForm task={editingTask} profile={data.profile} onSubmit={(payload) => void saveTasks(payload, editingTask)} /></Modal>}
      {modal === "reward" && <Modal title={editingReward ? "修改奖励" : "创建奖励"} onClose={() => setModal(null)}><RewardForm reward={editingReward} onSubmit={(payload) => void saveReward(payload, editingReward)} /></Modal>}
      {modal === "pin" && <Modal title={data.profile.parent_pin_set ? "进入家长模式" : "设置家长密码"} onClose={() => setModal(null)} narrow><PinForm setup={!data.profile.parent_pin_set} onSubmit={(pin) => void verifyPin(pin)} /></Modal>}
      {modal === "points" && <Modal title="调整星星" onClose={() => setModal(null)} narrow><AdjustmentForm unit="颗星星" onSubmit={(amount, reason) => void adjustPoints(amount, reason)} /></Modal>}
      {modal === "game" && <Modal title="调整游戏时间" onClose={() => setModal(null)} narrow><AdjustmentForm unit="分钟" onSubmit={(amount, reason) => void adjustGame(amount, reason)} /></Modal>}
      {modal === "approval" && approvingTask && <Modal title="确认任务奖励" onClose={() => { setModal(null); setApprovingTask(null); }} narrow><ApprovalForm task={approvingTask} onSubmit={(awardedStars, reason) => void approveTask(approvingTask, awardedStars, reason)} /></Modal>}
      {modal === "penalty" && penalizingTask && <Modal title="记录任务未完成" onClose={() => { setModal(null); setPenalizingTask(null); }} narrow><PenaltyForm task={penalizingTask} balance={data.profile.stars_balance} onSubmit={(result, reason) => void penalizeTask(penalizingTask, result, reason)} /></Modal>}
      {toast && <div className="toast" role="status"><CheckCircle2 size={18} />{toast}</div>}
    </div>
  );
}

function cleanTaskPayload(payload: Partial<GrowthTask>) {
  const allowed = ["series_id", "title", "description", "category", "task_date", "start_time", "duration_minutes", "star_reward", "star_penalty", "game_minutes_reward", "repeat_type", "weekdays", "require_parent_approval", "is_required", "is_active", "status"] as const;
  return Object.fromEntries(allowed.filter((key) => payload[key] !== undefined).map((key) => [key, payload[key]]));
}

function createTaskInstances(payload: Partial<GrowthTask>, id: string | null, profile: Profile): GrowthTask[] {
  const start = new Date(`${payload.task_date ?? TODAY()}T12:00:00`);
  const repeat = payload.repeat_type ?? "不重复";
  const end = profile.holiday_end ? new Date(`${profile.holiday_end}T12:00:00`) : new Date(start.getTime() + 28 * 86400000);
  const maxEnd = new Date(start.getTime() + 60 * 86400000);
  if (end > maxEnd) end.setTime(maxEnd.getTime());
  const dates: Date[] = [];
  for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
    const day = date.getDay();
    const include = repeat === "不重复"
      ? dates.length === 0
      : repeat === "每天"
        ? true
        : repeat === "周一至周五"
          ? day >= 1 && day <= 5
          : (payload.weekdays ?? []).includes(day);
    if (include) dates.push(new Date(date));
    if (repeat === "不重复" && dates.length) break;
  }
  const series = repeat === "不重复" ? null : makeId();
  return dates.map((date, index) => ({
    id: id ?? makeId(),
    user_id: profile.user_id,
    series_id: series,
    title: payload.title ?? "新任务",
    description: payload.description ?? "",
    category: payload.category ?? "学习",
    task_date: date.toLocaleDateString("en-CA"),
    start_time: payload.start_time ?? null,
    duration_minutes: Number(payload.duration_minutes ?? 30),
    star_reward: Number(payload.star_reward ?? 5),
    star_penalty: Number(payload.star_penalty ?? 0),
    game_minutes_reward: Number(payload.game_minutes_reward ?? 0),
    repeat_type: repeat,
    weekdays: payload.weekdays ?? [],
    require_parent_approval: payload.require_parent_approval ?? true,
    is_required: payload.is_required ?? false,
    is_active: payload.is_active ?? true,
    status: "未开始",
    completed_at: null,
    approved_at: null,
    reward_granted: false,
    star_awarded: null,
    penalty_applied: false,
    penalized_at: null,
    parent_note: null,
    created_at: new Date(Date.now() + index).toISOString(),
  }));
}

function Brand() {
  return <div className="brand"><div className="brand-mark"><Sparkles size={21} /></div><div><strong>假期成长计划</strong><span>每天进步一点点</span></div></div>;
}

function NavButton({ item, active, onClick }: { item: (typeof navItems)[number]; active: boolean; onClick: () => void }) {
  const Icon = item.icon;
  return <button className={cn("nav-button", active && "active")} onClick={onClick}><Icon size={21} /><span>{item.label}</span></button>;
}

function Avatar({ name, url }: { name: string; url?: string | null }) {
  return <div className={cn("avatar", Boolean(url) && "has-image")} style={url ? { backgroundImage: `url(${url})` } : undefined} aria-label={`${name || "孩子"}的头像`}>{url ? "" : (name || "成").slice(0, 1)}</div>;
}

function LoadingScreen() {
  return <div className="loading-screen" role="status"><div className="brand-mark"><Sparkles size={24} /></div><div><strong>正在准备今天的成长计划…</strong><span>网络较慢时可能需要几秒钟</span></div></div>;
}

function StartupErrorScreen({ message }: { message: string }) {
  return <div className="loading-screen error-state" role="alert"><div className="brand-mark"><RefreshCcw size={24} /></div><div><strong>页面暂时没有加载成功</strong><span>{message}</span><button className="primary-button" onClick={() => window.location.reload()}><RefreshCcw size={17} />重新加载</button></div></div>;
}

function AuthScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setMessage("");
    const result = isSignUp
      ? await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.href } })
      : await supabase.auth.signInWithPassword({ email, password });
    if (result.error) setMessage(result.error.message === "Invalid login credentials" ? "邮箱或密码不正确" : result.error.message);
    else if (isSignUp && !result.data.session) setMessage("注册成功，请到邮箱中完成验证后登录。 ");
    setBusy(false);
  }
  return <div className="auth-screen"><section className="auth-intro"><Brand /><div className="auth-copy"><p className="eyebrow">把假期过得充实，也过得轻松</p><h1>每完成一件小事，<br />成长就清晰一点。</h1><p>任务、星星、游戏时间和家庭奖励，放在一个简单的计划里。</p></div><div className="auth-note"><Star size={18} fill="currentColor" /> 今天的努力，会变成明天的自信。</div></section><section className="auth-panel"><form className="auth-card" onSubmit={submit}><div className="auth-icon"><UserRound size={22} /></div><h2>{isSignUp ? "创建家庭账号" : "欢迎回来"}</h2><p>{isSignUp ? "注册后，手机和电脑会使用同一份数据" : "登录后继续今天的成长计划"}</p><label>邮箱<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="name@example.com" autoComplete="email" /></label><label>密码<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} placeholder="至少 6 位" autoComplete={isSignUp ? "new-password" : "current-password"} /></label>{message && <div className="form-message">{message}</div>}<button className="primary-button wide" disabled={busy}>{busy ? "请稍候…" : isSignUp ? "创建账号" : "登录"}</button><button type="button" className="text-button" onClick={() => { setIsSignUp(!isSignUp); setMessage(""); }}>{isSignUp ? "已有账号？直接登录" : "还没有账号？创建一个"}</button></form></section></div>;
}

function TodayView({ data, mode, tasks, progress, remainingSeconds, onSubmitTask, onApproveTask, onRejectTask, onPenalizeTask, onGameAction, onAdjustGame }: {
  data: AppData; mode: AppMode; tasks: GrowthTask[]; progress: number; remainingSeconds: number;
  onSubmitTask: (task: GrowthTask) => void; onApproveTask: (task: GrowthTask) => void; onRejectTask: (task: GrowthTask) => void;
  onPenalizeTask: (task: GrowthTask) => void;
  onGameAction: (action: "start" | "pause" | "stop") => void; onAdjustGame: () => void;
}) {
  const completed = tasks.filter((task) => task.status === "已完成").length;
  const game = data.game;
  const requiredTasksIncomplete = data.profile.require_tasks_before_game && tasks.some((task) => task.is_required && task.status !== "已完成");
  return <div className="today-grid"><section className="hero-card"><div className="progress-ring" style={{ "--progress": `${progress * 3.6}deg` } as React.CSSProperties}><div><strong>{progress}%</strong><span>今日完成</span></div></div><div className="hero-copy"><p className="eyebrow">今日成长进度</p><h2>{progress === 100 ? "今天的计划全部完成了！" : progress >= 50 ? "已经完成一大半，继续保持" : "从第一件小事开始吧"}</h2><p>完成 <strong>{completed}</strong> 项，共 <strong>{tasks.length}</strong> 项</p><div className="linear-progress"><span style={{ width: `${progress}%` }} /></div></div><div className="hero-stars"><Star size={20} fill="currentColor" /><strong>{data.profile.stars_balance}</strong><span>当前星星</span></div></section>

    <section className="stats-row">
      <MiniStat icon={<CheckCircle2 />} label="今日任务" value={`${completed}/${tasks.length}`} tone="green" />
      <MiniStat icon={<Star />} label="当前星星" value={`${data.profile.stars_balance}`} tone="gold" />
      <MiniStat icon={<Gamepad2 />} label="剩余游戏" value={`${Math.ceil(remainingSeconds / 60)} 分钟`} tone="blue" />
    </section>

    <section className="card task-section"><div className="section-heading"><div><p className="eyebrow">今天还要做什么</p><h2>今日任务</h2></div><span className="section-count">{tasks.filter((task) => task.status !== "已完成").length} 项待完成</span></div><div className="task-list">{tasks.length ? tasks.map((task) => <TaskRow key={task.id} task={task} mode={mode} onSubmit={() => onSubmitTask(task)} onApprove={() => onApproveTask(task)} onReject={() => onRejectTask(task)} onPenalize={() => onPenalizeTask(task)} />) : <EmptyState icon={<CalendarDays />} title="今天还没有任务" text={mode === "parent" ? "到“计划”页面添加今天的安排吧。" : "今天暂时没有安排，好好享受假期。"} />}</div></section>

    <section className="card game-card"><div className="game-top"><div className="game-icon"><Gamepad2 /></div><div><p className="eyebrow">游戏时间管理</p><h2>{game.timer_status === "计时中" ? "正在游戏" : "今日可用时间"}</h2></div><StatusBadge status={game.timer_status} /></div><div className="timer-display"><strong>{formatClock(remainingSeconds)}</strong><span>剩余时间</span></div><div className="game-breakdown"><span>基础 <b>{game.base_minutes} 分钟</b></span><span>任务奖励 <b>+{game.earned_minutes} 分钟</b></span><span>已使用 <b>{Math.floor((getGameAvailableMinutes(data.profile, game) * 60 - remainingSeconds) / 60)} 分钟</b></span></div>{requiredTasksIncomplete && <p className="game-lock-note">完成今天的必做任务后，就可以开始游戏。</p>}<div className="game-actions">{game.timer_status === "计时中" ? <button className="secondary-button" onClick={() => onGameAction("pause")}><CirclePause size={18} />暂停计时</button> : <button className="primary-button" disabled={remainingSeconds <= 0 || requiredTasksIncomplete} onClick={() => onGameAction("start")}><CirclePlay size={18} />{requiredTasksIncomplete ? "先完成必做任务" : "开始游戏"}</button>}<button className="secondary-button" disabled={game.timer_status !== "计时中" && game.timer_status !== "已暂停"} onClick={() => onGameAction("stop")}><Check size={18} />结束游戏</button>{mode === "parent" && <button className="text-button inline" onClick={onAdjustGame}>家长调整</button>}</div></section>
  </div>;
}

function MiniStat({ icon, label, value, tone }: { icon: ReactNode; label: string; value: string; tone: string }) {
  return <div className="mini-stat"><span className={`mini-icon ${tone}`}>{icon}</span><div><span>{label}</span><strong>{value}</strong></div></div>;
}

function TaskRow({ task, mode, onSubmit, onApprove, onReject, onPenalize }: { task: GrowthTask; mode: AppMode; onSubmit: () => void; onApprove: () => void; onReject: () => void; onPenalize: () => void }) {
  const meta = categoryMeta[task.category] ?? categoryMeta.其他;
  const Icon = meta.icon;
  const awardedStars = task.status === "已完成" && task.star_awarded !== null && task.star_awarded !== undefined
    ? task.star_awarded
    : task.star_reward;
  const rewardAdjusted = task.status === "已完成" && task.star_awarded !== null && task.star_awarded !== undefined && task.star_awarded < task.star_reward;
  return <article className={cn("task-row", task.status === "已完成" && "completed")}><div className={`task-category ${meta.tone}`}><Icon size={20} /></div><div className="task-main"><div className="task-title-line"><h3>{task.title}</h3>{task.is_required && <span className="required-tag">必做</span>}<StatusBadge status={task.status} /></div><p>{task.description || `${task.category}任务`}</p>{task.parent_note && task.status === "未完成" && <p className="penalty-note">家长说明：{task.parent_note}</p>}{task.parent_note && rewardAdjusted && <p className="approval-note">家长评价：{task.parent_note}</p>}<div className="task-meta">{task.start_time && <span><Clock3 size={14} />{task.start_time.slice(0, 5)}</span>}<span>{task.duration_minutes} 分钟</span><span className="reward-meta"><Star size={14} fill="currentColor" />+{awardedStars}{rewardAdjusted && <small>（原定 +{task.star_reward}）</small>}</span>{task.star_penalty > 0 && <span className="penalty-meta"><Star size={14} />-{task.star_penalty}</span>}{task.game_minutes_reward > 0 && <span className="game-meta"><Gamepad2 size={14} />+{task.game_minutes_reward} 分钟</span>}</div></div><div className="task-actions">{mode === "child" && ["未开始", "进行中", "未完成"].includes(task.status) && <button className="primary-button small" onClick={onSubmit}>完成任务</button>}{mode === "parent" && task.status === "待家长确认" && <><button className="primary-button small" onClick={onApprove}><Check size={16} />确认并评分</button><button className="secondary-button small" onClick={onReject}><X size={16} />退回</button></>}{mode === "parent" && task.status !== "已完成" && task.star_penalty > 0 && !task.penalty_applied && <button className="secondary-button small penalty-button" onClick={onPenalize}><Star size={15} />扣星</button>}{task.penalty_applied && <span className="penalty-mark">惩罚已记录</span>}{task.status === "已完成" && <span className="done-mark"><CheckCircle2 size={22} />已完成</span>}{task.status === "待家长确认" && mode === "child" && <span className="waiting-copy">等待家长确认</span>}</div></article>;
}

function PlanView({ data, mode, onAdd, onEdit, onDelete, onDuplicate, onPostpone, onToggle, onSaveGoals }: {
  data: AppData; mode: AppMode; onAdd: () => void; onEdit: (task: GrowthTask) => void; onDelete: (task: GrowthTask) => void; onDuplicate: (task: GrowthTask) => void; onPostpone: (task: GrowthTask) => void; onToggle: (task: GrowthTask) => void; onSaveGoals: (goals: string[]) => void;
}) {
  const [tab, setTab] = useState<"today" | "week" | "goals">("today");
  const [goalDraft, setGoalDraft] = useState("");
  const dates = getWeekDates();
  const visible = tab === "today" ? data.tasks.filter((task) => task.task_date === TODAY()) : data.tasks.filter((task) => dates.includes(task.task_date));
  const grouped = dates.map((date) => ({ date, tasks: visible.filter((task) => task.task_date === date) })).filter((group) => tab !== "week" || group.tasks.length);
  function addGoal() {
    const value = goalDraft.trim();
    if (!value) return;
    onSaveGoals([...(data.profile.holiday_goals ?? []), value]);
    setGoalDraft("");
  }
  return <div className="page-stack"><section className="page-title"><div><p className="eyebrow">安排与目标</p><h2>假期计划</h2><p>把大目标拆成每天都做得到的小任务。</p></div>{mode === "parent" && tab !== "goals" && <button className="primary-button" onClick={onAdd}><Plus size={18} />创建任务</button>}</section><div className="segmented"><button className={tab === "today" ? "active" : ""} onClick={() => setTab("today")}>今日计划</button><button className={tab === "week" ? "active" : ""} onClick={() => setTab("week")}>本周计划</button><button className={tab === "goals" ? "active" : ""} onClick={() => setTab("goals")}>假期目标</button></div>{tab === "goals" ? <section className="card goals-card"><div className="section-heading"><div><p className="eyebrow">这个假期想做到</p><h2>假期目标</h2></div></div><div className="goal-list">{(data.profile.holiday_goals ?? []).map((goal, index) => <div className="goal-item" key={`${goal}-${index}`}><span>{index + 1}</span><strong>{goal}</strong>{mode === "parent" && <button className="icon-button danger" onClick={() => onSaveGoals(data.profile.holiday_goals.filter((_, i) => i !== index))}><Trash2 size={17} /></button>}</div>)}{!data.profile.holiday_goals.length && <EmptyState icon={<Award />} title="还没有假期目标" text="可以从阅读、运动或生活习惯开始。" />}</div>{mode === "parent" && <div className="inline-form"><input value={goalDraft} onChange={(e) => setGoalDraft(e.target.value)} placeholder="例如：每天阅读 30 分钟" onKeyDown={(e) => e.key === "Enter" && addGoal()} /><button className="primary-button" onClick={addGoal}><Plus size={17} />添加</button></div>}</section> : <section className="card plan-list">{visible.length ? (tab === "today" ? <div className="manage-list">{visible.map((task) => <ManagedTask key={task.id} task={task} mode={mode} onEdit={() => onEdit(task)} onDelete={() => onDelete(task)} onDuplicate={() => onDuplicate(task)} onPostpone={() => onPostpone(task)} onToggle={() => onToggle(task)} />)}</div> : grouped.map((group) => <div className="date-group" key={group.date}><div className="date-label"><strong>{new Intl.DateTimeFormat("zh-CN", { weekday: "long" }).format(new Date(`${group.date}T12:00:00`))}</strong><span>{group.date.slice(5).replace("-", "/")}</span></div><div className="manage-list">{group.tasks.map((task) => <ManagedTask key={task.id} task={task} mode={mode} onEdit={() => onEdit(task)} onDelete={() => onDelete(task)} onDuplicate={() => onDuplicate(task)} onPostpone={() => onPostpone(task)} onToggle={() => onToggle(task)} />)}</div></div>)) : <EmptyState icon={<CalendarDays />} title="这里还没有计划" text={mode === "parent" ? "创建第一个任务，安排一个轻松有序的假期。" : "家长还没有安排任务。"} />}</section>}</div>;
}

function ManagedTask({ task, mode, onEdit, onDelete, onDuplicate, onPostpone, onToggle }: { task: GrowthTask; mode: AppMode; onEdit: () => void; onDelete: () => void; onDuplicate: () => void; onPostpone: () => void; onToggle: () => void }) {
  const meta = categoryMeta[task.category] ?? categoryMeta.其他;
  const Icon = meta.icon;
  return <article className={cn("managed-task", !task.is_active && "disabled")}><span className={`task-category ${meta.tone}`}><Icon size={19} /></span><div><h3>{task.title}</h3><p>{task.start_time?.slice(0, 5) || "未设时间"} · {task.duration_minutes} 分钟 · {task.repeat_type}</p></div><StatusBadge status={task.is_active ? task.status : "已停用"} />{mode === "parent" && <div className="manage-actions"><button className="icon-button" title="修改" onClick={onEdit}><Pencil size={17} /></button><button className="icon-button" title="复制" onClick={onDuplicate}><Copy size={17} /></button><button className="icon-button" title="顺延" onClick={onPostpone}><ChevronRight size={17} /></button><button className="text-button inline" onClick={onToggle}>{task.is_active ? "停用" : "启用"}</button><button className="icon-button danger" title="删除" onClick={onDelete}><Trash2 size={17} /></button></div>}</article>;
}

function RewardsView({ data, mode, onAdd, onEdit, onDelete, onRequest, onReview, onFulfill }: { data: AppData; mode: AppMode; onAdd: () => void; onEdit: (reward: Reward) => void; onDelete: (reward: Reward) => void; onRequest: (reward: Reward) => void; onReview: (redemption: Redemption, decision: "approve" | "reject") => void; onFulfill: (redemption: Redemption) => void }) {
  return <div className="page-stack"><section className="reward-hero"><div><p className="eyebrow">星星奖励站</p><h2>努力换来期待的小奖励</h2><p>当前拥有 <strong>{data.profile.stars_balance}</strong> 颗星星</p></div><div className="big-star"><Star fill="currentColor" /><strong>{data.profile.stars_balance}</strong></div>{mode === "parent" && <button className="primary-button light" onClick={onAdd}><Plus size={18} />添加奖励</button>}</section><section><div className="section-heading"><div><p className="eyebrow">可以兑换</p><h2>奖励清单</h2></div></div><div className="reward-grid">{data.rewards.filter((reward) => reward.is_active || mode === "parent").map((reward) => <RewardCard key={reward.id} reward={reward} balance={data.profile.stars_balance} mode={mode} onRequest={() => onRequest(reward)} onEdit={() => onEdit(reward)} onDelete={() => onDelete(reward)} />)}{!data.rewards.length && <EmptyState icon={<Gift />} title="还没有奖励" text="家长可以创建一个孩子真正期待的小奖励。" />}</div></section><section className="card"><div className="section-heading"><div><p className="eyebrow">过程清楚可见</p><h2>兑换记录</h2></div></div><div className="redemption-list">{data.redemptions.length ? data.redemptions.map((item) => { const reward = data.rewards.find((candidate) => candidate.id === item.reward_id); return <article className="redemption-row" key={item.id}><span className="reward-emoji small">{reward?.icon ?? "🎁"}</span><div><h3>{reward?.title ?? "历史奖励"}</h3><p>{formatDateTime(item.requested_at)} · {item.cost} 颗星星</p></div><StatusBadge status={item.status} /><div className="redemption-actions">{mode === "parent" && item.status === "待审核" && <><button className="primary-button small" onClick={() => onReview(item, "approve")}>批准</button><button className="secondary-button small" onClick={() => onReview(item, "reject")}>拒绝</button></>}{mode === "parent" && item.status === "待兑现" && <button className="primary-button small" onClick={() => onFulfill(item)}>标记已兑现</button>}</div></article>; }) : <EmptyState icon={<Gift />} title="还没有兑换记录" text="完成任务积累星星，再来选择喜欢的奖励。" />}</div></section></div>;
}

function RewardCard({ reward, balance, mode, onRequest, onEdit, onDelete }: { reward: Reward; balance: number; mode: AppMode; onRequest: () => void; onEdit: () => void; onDelete: () => void }) {
  return <article className={cn("reward-card", !reward.is_active && "disabled")}><div className="reward-emoji">{reward.icon || "🎁"}</div><div className="reward-card-top"><span>{reward.category}</span>{reward.stock !== null && <span>剩余 {reward.stock}</span>}</div><h3>{reward.title}</h3><p>{reward.description || "完成计划，用星星兑换这份奖励。"}</p><div className="reward-card-bottom"><strong><Star size={17} fill="currentColor" />{reward.cost}</strong>{mode === "child" ? <button className="primary-button small" disabled={!reward.is_active || balance < reward.cost || reward.stock === 0} onClick={onRequest}>{balance < reward.cost ? "星星不足" : "申请兑换"}</button> : <div className="compact-actions"><button className="icon-button" aria-label={`修改${reward.title}`} onClick={onEdit}><Pencil size={17} /></button><button className="icon-button danger" aria-label={`删除${reward.title}`} onClick={onDelete}><Trash2 size={17} /></button></div>}</div></article>;
}

function RecordsView({ data, mode, onSaveReview }: { data: AppData; mode: AppMode; onSaveReview: (review: DailyReview) => void }) {
  return <><RecordsBase data={data} mode={mode} onSaveReview={onSaveReview} /><WeeklyStats data={data} /></>;
}

function RecordsBase({ data, mode, onSaveReview }: { data: AppData; mode: AppMode; onSaveReview: (review: DailyReview) => void }) {
  const dates = getWeekDates();
  const weekTasks = data.tasks.filter((task) => dates.includes(task.task_date));
  const todayTasks = weekTasks.filter((task) => task.task_date === TODAY());
  const todayDone = todayTasks.filter((task) => task.status === "已完成");
  const earned = data.points.filter((point) => point.created_at.slice(0, 10) === TODAY() && point.amount > 0).reduce((sum, point) => sum + point.amount, 0);
  const spent = Math.abs(data.points.filter((point) => point.created_at.slice(0, 10) === TODAY() && point.amount < 0).reduce((sum, point) => sum + point.amount, 0));
  const minutes = (category: TaskCategory) => todayDone.filter((task) => task.category === category).reduce((sum, task) => sum + task.duration_minutes, 0);
  const dailyRates = dates.map((date) => { const tasks = weekTasks.filter((task) => task.task_date === date); return tasks.length ? Math.round(tasks.filter((task) => task.status === "已完成").length / tasks.length * 100) : 0; });
  return <div className="page-stack"><section className="page-title"><div><p className="eyebrow">看见每天的积累</p><h2>成长记录</h2><p>记录做到了什么，也记录今天的感受。</p></div></section><section className="metric-grid"><MetricCard label="任务完成" value={`${todayDone.length}/${todayTasks.length}`} detail={`${todayTasks.length ? Math.round(todayDone.length / todayTasks.length * 100) : 0}% 完成率`} /><MetricCard label="获得星星" value={`+${earned}`} detail={`使用 ${spent} 颗`} /><MetricCard label="学习与阅读" value={`${minutes("学习") + minutes("阅读")} 分钟`} detail={`阅读 ${minutes("阅读")} 分钟`} /><MetricCard label="运动时间" value={`${minutes("运动")} 分钟`} detail="保持身体有活力" /></section><section className="record-grid"><div className="card chart-card"><div className="section-heading"><div><p className="eyebrow">本周趋势</p><h2>每日任务完成率</h2></div></div><div className="bar-chart">{dailyRates.map((rate, index) => <div className="bar-column" key={dates[index]}><div className="bar-track"><span style={{ height: `${Math.max(rate, 4)}%` }} /></div><strong>{rate}%</strong><small>{["一", "二", "三", "四", "五", "六", "日"][index]}</small></div>)}</div></div><DailyReviewCard data={data} mode={mode} onSave={onSaveReview} /></section><section className="card"><div className="section-heading"><div><p className="eyebrow">每一颗星都有来由</p><h2>星星流水</h2></div></div><div className="transaction-list">{data.points.length ? data.points.slice(0, 30).map((point) => <div className="transaction-row" key={point.id}><span className={point.amount >= 0 ? "positive" : "negative"}>{point.amount >= 0 ? "+" : ""}{point.amount}</span><div><strong>{point.reason}</strong><p>{formatDateTime(point.created_at)} · {point.transaction_type} · {point.operator}</p></div><small>余额 {point.balance_after}</small></div>) : <EmptyState icon={<Star />} title="还没有星星记录" text="完成第一个任务后，这里会出现清晰的积分流水。" />}</div></section></div>;
}

function WeeklyStats({ data }: { data: AppData }) {
  const dates = getWeekDates();
  const completed = data.tasks.filter((task) => dates.includes(task.task_date) && task.status === "已完成");
  const weekPoints = data.points.filter((point) => dates.includes(new Date(point.created_at).toLocaleDateString("en-CA")));
  const earned = weekPoints.filter((point) => point.amount > 0).reduce((sum, point) => sum + point.amount, 0);
  const spent = Math.abs(weekPoints.filter((point) => point.amount < 0).reduce((sum, point) => sum + point.amount, 0));
  const redemptionCount = data.redemptions.filter((item) => item.status !== "已拒绝" && dates.includes(new Date(item.requested_at).toLocaleDateString("en-CA"))).length;
  const categories = CATEGORIES.map((category) => ({ category, minutes: completed.filter((task) => task.category === category).reduce((sum, task) => sum + task.duration_minutes, 0) })).filter((item) => item.minutes > 0).sort((a, b) => b.minutes - a.minutes);
  const maxCategory = Math.max(...categories.map((item) => item.minutes), 1);
  const games = dates.map((date) => {
    const record = date === data.game.record_date ? data.game : data.gameHistory.find((item) => item.record_date === date);
    return record ? Math.round(record.used_seconds / 60) : 0;
  });
  const maxGame = Math.max(...games, 1);
  let streak = 0;
  for (const date of dates.filter((date) => date <= TODAY()).reverse()) {
    const tasks = data.tasks.filter((task) => task.task_date === date && task.is_active);
    if (!tasks.length || tasks.some((task) => task.status !== "已完成")) break;
    streak += 1;
  }
  return <section className="card weekly-card"><div className="section-heading"><div><p className="eyebrow">一周轻复盘</p><h2>本周成长概览</h2></div></div><div className="week-insight-grid"><MetricCard label="连续完成" value={`${streak} 天`} detail="全部计划完成" /><MetricCard label="获得星星" value={`+${earned}`} detail={`使用 ${spent} 颗`} /><MetricCard label="完成任务" value={`${completed.length} 项`} detail="本周累计" /><MetricCard label="奖励兑换" value={`${redemptionCount} 次`} detail="不含已拒绝" /></div><div className="weekly-detail-grid"><div><h3>各类别投入时间</h3><div className="category-bars">{categories.length ? categories.map((item) => <div className="category-bar" key={item.category}><span>{item.category}</span><div><i style={{ width: `${item.minutes / maxCategory * 100}%` }} /></div><strong>{item.minutes} 分钟</strong></div>) : <p className="muted-copy">本周完成任务后，这里会显示投入时间。</p>}</div></div><div><h3>每日游戏时间</h3><div className="game-trend">{games.map((minutes, index) => <div key={dates[index]}><span><i style={{ height: `${Math.max(minutes / maxGame * 100, 4)}%` }} /></span><strong>{minutes}</strong><small>{["一", "二", "三", "四", "五", "六", "日"][index]}</small></div>)}</div></div></div></section>;
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="metric-card"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>;
}

function DailyReviewCard({ data, mode, onSave }: { data: AppData; mode: AppMode; onSave: (review: DailyReview) => void }) {
  const existing = data.reviews.find((review) => review.review_date === TODAY());
  const [review, setReview] = useState<DailyReview>(existing ?? { review_date: TODAY(), mood: "开心", child_proud_of: "", child_difficulty: "", child_tomorrow_goal: "", parent_comment: "", parent_suggestion: "" });
  return <form className="card review-card" onSubmit={(event) => { event.preventDefault(); onSave(review); }}><div className="section-heading"><div><p className="eyebrow">睡前两分钟</p><h2>今日小结</h2></div><span className="saved-label">{existing ? "已保存" : "未填写"}</span></div><label>今天开心吗？<div className="mood-options">{(["很开心", "开心", "一般", "不开心"] as const).map((mood) => <button type="button" key={mood} className={review.mood === mood ? "active" : ""} onClick={() => setReview({ ...review, mood })}>{mood === "很开心" ? "😄" : mood === "开心" ? "🙂" : mood === "一般" ? "😐" : "🙁"}<span>{mood}</span></button>)}</div></label><label>今天最满意的事情<textarea value={review.child_proud_of} onChange={(e) => setReview({ ...review, child_proud_of: e.target.value })} placeholder="一句话就可以" maxLength={160} /></label><label>遇到的困难<textarea value={review.child_difficulty} onChange={(e) => setReview({ ...review, child_difficulty: e.target.value })} placeholder="没有也可以不填" maxLength={160} /></label><label>明天想改进什么<input value={review.child_tomorrow_goal} onChange={(e) => setReview({ ...review, child_tomorrow_goal: e.target.value })} placeholder="给明天一个小目标" maxLength={100} /></label>{mode === "parent" && <div className="parent-review"><label>家长鼓励语<input value={review.parent_comment} onChange={(e) => setReview({ ...review, parent_comment: e.target.value })} placeholder="肯定今天做得好的地方" /></label><label>明日建议<input value={review.parent_suggestion} onChange={(e) => setReview({ ...review, parent_suggestion: e.target.value })} placeholder="只给一条具体建议" /></label></div>}<button className="primary-button wide">保存今日小结</button></form>;
}

function SettingsView({ data, mode, isDemo, onSaveProfile, onSetPin, onAdjustPoints, onExport, onReset, onSignOut }: { data: AppData; mode: AppMode; isDemo: boolean; onSaveProfile: (patch: Partial<Profile>) => void; onSetPin: (pin: string) => void; onAdjustPoints: () => void; onExport: () => void; onReset: (kind: "today" | "stars" | "game" | "all", pin: string) => void; onSignOut: () => void }) {
  const [profile, setProfile] = useState(data.profile);
  const [pin, setPinValue] = useState("");
  const [resetPin, setResetPin] = useState("");
  if (mode !== "parent") return <div className="locked-settings"><ShieldCheck size={32} /><h2>家长设置</h2><p>切换到家长模式后，才能修改资料、规则和数据。</p></div>;
  return <div className="page-stack"><section className="page-title"><div><p className="eyebrow">家庭管理</p><h2>设置</h2><p>调整规则时，尽量保持简单、稳定和可执行。</p></div></section>{isDemo && <div className="info-banner">当前是演示模式。连接 Supabase 后，登录与跨设备同步才会启用。</div>}<section className="settings-grid"><form className="card settings-card" onSubmit={(e) => { e.preventDefault(); onSaveProfile({ child_name: profile.child_name, avatar_url: profile.avatar_url, holiday_start: profile.holiday_start, holiday_end: profile.holiday_end }); }}><div className="setting-title"><span className="setting-icon green"><UserRound /></span><div><h3>孩子资料</h3><p>首页显示的基本信息</p></div></div><label>孩子姓名<input value={profile.child_name} onChange={(e) => setProfile({ ...profile, child_name: e.target.value })} maxLength={20} /></label><label>头像图片网址（可选）<input type="url" value={profile.avatar_url ?? ""} onChange={(e) => setProfile({ ...profile, avatar_url: e.target.value || null })} placeholder="https://..." /></label><div className="form-grid two"><label>假期开始<input type="date" value={profile.holiday_start ?? ""} onChange={(e) => setProfile({ ...profile, holiday_start: e.target.value })} /></label><label>假期结束<input type="date" value={profile.holiday_end ?? ""} onChange={(e) => setProfile({ ...profile, holiday_end: e.target.value })} /></label></div><button className="secondary-button">保存资料</button></form><form className="card settings-card" onSubmit={(e) => { e.preventDefault(); onSaveProfile({ base_game_minutes: Number(profile.base_game_minutes), max_game_minutes: Number(profile.max_game_minutes), require_tasks_before_game: profile.require_tasks_before_game }); }}><div className="setting-title"><span className="setting-icon blue"><Gamepad2 /></span><div><h3>游戏设置</h3><p>时间到后只记录提醒，不控制设备</p></div></div><div className="form-grid two"><label>每日基础时间<input type="number" min="0" max="300" value={profile.base_game_minutes} onChange={(e) => setProfile({ ...profile, base_game_minutes: Number(e.target.value) })} /></label><label>每日最大时间<input type="number" min="0" max="600" value={profile.max_game_minutes} onChange={(e) => setProfile({ ...profile, max_game_minutes: Number(e.target.value) })} /></label></div><label className="check-line"><input type="checkbox" checked={profile.require_tasks_before_game} onChange={(e) => setProfile({ ...profile, require_tasks_before_game: e.target.checked })} />完成所有必做任务后才能开始游戏</label><button className="secondary-button">保存游戏规则</button></form><form className="card settings-card" onSubmit={(e) => { e.preventDefault(); onSaveProfile({ streak_reward: Number(profile.streak_reward), daily_points_cap: Number(profile.daily_points_cap) }); }}><div className="setting-title"><span className="setting-icon gold"><Star /></span><div><h3>积分设置</h3><p>星星余额固定不能为负数</p></div></div><div className="form-grid two"><label>连续完成奖励<input type="number" min="0" max="100" value={profile.streak_reward} onChange={(e) => setProfile({ ...profile, streak_reward: Number(e.target.value) })} /></label><label>每日积分上限<input type="number" min="1" max="1000" value={profile.daily_points_cap} onChange={(e) => setProfile({ ...profile, daily_points_cap: Number(e.target.value) })} /></label></div><div className="button-row"><button className="secondary-button">保存积分规则</button><button type="button" className="text-button inline" onClick={onAdjustPoints}>手动调整星星</button></div></form><form className="card settings-card" onSubmit={(e) => { e.preventDefault(); onSetPin(pin); setPinValue(""); }}><div className="setting-title"><span className="setting-icon purple"><ShieldCheck /></span><div><h3>家长管理密码</h3><p>进入家长模式时使用</p></div></div><label>新的四位数字密码<input type="password" inputMode="numeric" pattern="\d{4}" maxLength={4} value={pin} onChange={(e) => setPinValue(e.target.value.replace(/\D/g, ""))} placeholder="••••" /></label><button className="secondary-button">{data.profile.parent_pin_set ? "修改密码" : "设置密码"}</button></form></section><section className="card data-card"><div className="setting-title"><span className="setting-icon gray"><Download /></span><div><h3>数据管理</h3><p>重置操作需要输入家长管理密码</p></div></div><div className="data-actions"><button className="secondary-button" onClick={onExport}><Download size={17} />导出全部数据</button><button className="secondary-button" onClick={() => onReset("today", resetPin)}><RefreshCcw size={17} />重置今日任务状态</button><button className="secondary-button" onClick={() => onReset("stars", resetPin)}><Star size={17} />重置星星</button><button className="secondary-button" onClick={() => onReset("game", resetPin)}><Gamepad2 size={17} />重置游戏时间</button></div><label className="pin-inline">执行重置前输入管理密码<input type="password" inputMode="numeric" maxLength={4} value={resetPin} onChange={(e) => setResetPin(e.target.value.replace(/\D/g, ""))} placeholder="四位密码" /></label><div className="danger-zone"><div><strong>清空全部数据</strong><span>删除任务、奖励、记录和流水，账号与家长密码保留。</span></div><button className="danger-button" onClick={() => onReset("all", resetPin)}><Trash2 size={17} />清空全部数据</button></div></section>{!isDemo && <button className="signout-button" onClick={onSignOut}><LogOut size={18} />退出当前账号</button>}</div>;
}

function TaskForm({ task, profile, onSubmit }: { task: GrowthTask | null; profile: Profile; onSubmit: (payload: Partial<GrowthTask>) => void }) {
  const [form, setForm] = useState<Partial<GrowthTask>>(task ?? { title: "", description: "", category: "学习", task_date: TODAY(), start_time: "09:00", duration_minutes: 30, star_reward: 5, star_penalty: 0, game_minutes_reward: 0, repeat_type: "不重复", weekdays: [], require_parent_approval: true, is_required: false, is_active: true });
  const submit = (event: FormEvent) => { event.preventDefault(); onSubmit({ ...form, duration_minutes: Number(form.duration_minutes), star_reward: Number(form.star_reward), star_penalty: Number(form.star_penalty), game_minutes_reward: Number(form.game_minutes_reward) }); };
  return <form className="modal-form" onSubmit={submit}><label>任务名称<input value={form.title ?? ""} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="例如：完成数学练习" required maxLength={80} autoFocus /></label><div className="form-grid two"><label>任务分类<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as TaskCategory })}>{CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label><label>日期<input type="date" min={profile.holiday_start ?? undefined} max={profile.holiday_end ?? undefined} value={form.task_date} onChange={(e) => setForm({ ...form, task_date: e.target.value })} required /></label></div><label>任务说明<textarea value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="简单说明做到什么程度" maxLength={300} /></label><div className="form-grid three"><label>开始时间<input type="time" value={form.start_time ?? ""} onChange={(e) => setForm({ ...form, start_time: e.target.value || null })} /></label><label>预计用时（分钟）<input type="number" min="1" max="480" value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })} required /></label><label>重复规则<select value={form.repeat_type} disabled={Boolean(task)} onChange={(e) => setForm({ ...form, repeat_type: e.target.value as RepeatType })}>{(["不重复", "每天", "周一至周五", "每周指定日期"] as RepeatType[]).map((repeat) => <option key={repeat}>{repeat}</option>)}</select></label></div>{form.repeat_type === "每周指定日期" && <div className="weekday-picker">{["日", "一", "二", "三", "四", "五", "六"].map((label, day) => <button type="button" key={day} className={form.weekdays?.includes(day) ? "active" : ""} onClick={() => setForm({ ...form, weekdays: form.weekdays?.includes(day) ? form.weekdays.filter((value) => value !== day) : [...(form.weekdays ?? []), day] })}>周{label}</button>)}</div>}<div className="form-grid three"><label>完成奖励星星<input type="number" min="0" max="999" value={form.star_reward} onChange={(e) => setForm({ ...form, star_reward: Number(e.target.value) })} /></label><label>未完成扣除星星<input type="number" min="0" max="999" value={form.star_penalty} onChange={(e) => setForm({ ...form, star_penalty: Number(e.target.value) })} /></label><label>游戏奖励（分钟）<input type="number" min="0" max="300" value={form.game_minutes_reward} onChange={(e) => setForm({ ...form, game_minutes_reward: Number(e.target.value) })} /></label></div><div className="check-grid"><label className="check-line"><input type="checkbox" checked={form.require_parent_approval} onChange={(e) => setForm({ ...form, require_parent_approval: e.target.checked })} />需要家长确认</label><label className="check-line"><input type="checkbox" checked={form.is_required} onChange={(e) => setForm({ ...form, is_required: e.target.checked })} />设为必做任务</label></div>{!task && form.repeat_type !== "不重复" && <div className="info-banner compact">重复任务会创建到假期结束日，最长生成 60 天，可随时停用或删除。</div>}<button className="primary-button wide">{task ? "保存修改" : "创建任务"}</button></form>;
}

function ApprovalForm({ task, onSubmit }: { task: GrowthTask; onSubmit: (awardedStars: number, reason: string) => void }) {
  const [awardedStars, setAwardedStars] = useState(task.star_reward);
  const [reason, setReason] = useState("");
  const adjusted = awardedStars < task.star_reward;
  const validAmount = Number.isInteger(awardedStars) && awardedStars >= 0 && awardedStars <= task.star_reward;
  const withheldStars = validAmount ? task.star_reward - awardedStars : 0;
  const validReason = !adjusted || reason.trim().length >= 2;
  return <form className="modal-form" onSubmit={(e) => { e.preventDefault(); if (validAmount && validReason) onSubmit(awardedStars, reason.trim()); }}><p className="form-intro">任务“{task.title}”原定奖励 {task.star_reward} 颗星星。请根据实际完成质量确认本次发放数量。</p><label>实际奖励星星<input type="number" inputMode="numeric" min="0" max={task.star_reward} step="1" value={awardedStars} onChange={(e) => setAwardedStars(Number(e.target.value))} autoFocus required /></label><div className={cn("approval-summary", adjusted && "adjusted")}><span>原定 <strong>{task.star_reward}</strong> 颗</span><span>本次少发 <strong>{withheldStars}</strong> 颗</span><span>实际发放 <strong>{validAmount ? awardedStars : "—"}</strong> 颗</span></div>{adjusted && <label>调整原因<textarea value={reason} onChange={(e) => setReason(e.target.value)} required minLength={2} maxLength={200} placeholder="例如：任务完成了，但检查不够认真" /></label>}<div className="info-banner compact">这里只减少本次任务奖励，不会再次扣除孩子已有的星星；游戏时间仍按任务原设置发放。</div><button className="primary-button wide" disabled={!validAmount || !validReason}>确认并发放 {validAmount ? awardedStars : 0} 颗星星</button></form>;
}

function PenaltyForm({ task, balance, onSubmit }: { task: GrowthTask; balance: number; onSubmit: (result: "未完成" | "未达标", reason: string) => void }) {
  const [result, setResult] = useState<"未完成" | "未达标">("未完成");
  const [reason, setReason] = useState("");
  const actual = Math.min(task.star_penalty, balance);
  return <form className="modal-form" onSubmit={(e) => { e.preventDefault(); onSubmit(result, reason.trim()); }}><p className="form-intro">任务“{task.title}”设置扣除 {task.star_penalty} 颗星星。本次最多扣除 {actual} 颗，余额不会变成负数。</p><label>任务结果<select value={result} onChange={(e) => setResult(e.target.value as "未完成" | "未达标")}><option>未完成</option><option>未达标</option></select></label><label>具体原因<textarea value={reason} onChange={(e) => setReason(e.target.value)} required minLength={2} maxLength={200} placeholder="例如：只完成了一半，约定内容没有做到" autoFocus /></label><div className="info-banner compact">确认后只扣除一次，并自动写入星星流水。</div><button className="danger-button wide" disabled={reason.trim().length < 2}>确认记录并扣星</button></form>;
}

function RewardForm({ reward, onSubmit }: { reward: Reward | null; onSubmit: (payload: Partial<Reward>) => void }) {
  const [form, setForm] = useState<Partial<Reward>>(reward ?? { title: "", description: "", cost: 30, category: "娱乐", icon: "🎁", is_active: true, stock: null });
  return <form className="modal-form" onSubmit={(e) => { e.preventDefault(); onSubmit({ ...form, cost: Number(form.cost), stock: form.stock === null || form.stock === undefined ? null : Number(form.stock) }); }}><div className="form-grid icon-title"><label>图标<input value={form.icon ?? ""} onChange={(e) => setForm({ ...form, icon: e.target.value })} maxLength={4} /></label><label>奖励名称<input value={form.title ?? ""} onChange={(e) => setForm({ ...form, title: e.target.value })} required maxLength={80} autoFocus /></label></div><label>奖励说明<textarea value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={240} placeholder="什么时候用、是否需要提前约定" /></label><div className="form-grid three"><label>所需星星<input type="number" min="1" max="9999" value={form.cost} onChange={(e) => setForm({ ...form, cost: Number(e.target.value) })} /></label><label>奖励分类<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{REWARD_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label><label>可兑换次数<input type="number" min="0" value={form.stock ?? ""} onChange={(e) => setForm({ ...form, stock: e.target.value === "" ? null : Number(e.target.value) })} placeholder="不填则不限" /></label></div><label className="check-line"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />启用这个奖励</label><button className="primary-button wide">{reward ? "保存修改" : "创建奖励"}</button></form>;
}

function PinForm({ setup, onSubmit }: { setup: boolean; onSubmit: (pin: string) => void }) {
  const [pin, setPin] = useState("");
  return <form className="modal-form" onSubmit={(e) => { e.preventDefault(); onSubmit(pin); }}><p className="form-intro">{setup ? "首次使用请创建四位数字密码，以后进入家长模式时需要验证。" : "家长操作会影响任务、星星和奖励，请输入四位管理密码。"}</p><label>管理密码<input className="pin-input" type="password" inputMode="numeric" pattern="\d{4}" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} placeholder="••••" autoFocus /></label><button className="primary-button wide">{setup ? "创建并进入" : "确认进入"}</button></form>;
}

function AdjustmentForm({ unit, onSubmit }: { unit: string; onSubmit: (amount: number, reason: string) => void }) {
  const [amount, setAmount] = useState(0);
  const [reason, setReason] = useState("");
  return <form className="modal-form" onSubmit={(e) => { e.preventDefault(); onSubmit(amount, reason); }}><p className="form-intro">输入正数表示增加，负数表示扣除。每次调整都会生成记录。</p><label>调整数量（{unit}）<input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} required autoFocus /></label><label>调整原因<input value={reason} onChange={(e) => setReason(e.target.value)} required minLength={2} maxLength={120} placeholder="请说明为什么调整" /></label><button className="primary-button wide" disabled={!amount || !reason.trim()}>确认调整</button></form>;
}

function Modal({ title, children, onClose, narrow = false }: { title: string; children: ReactNode; onClose: () => void; narrow?: boolean }) {
  useEffect(() => { const handler = (event: KeyboardEvent) => event.key === "Escape" && onClose(); window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler); }, [onClose]);
  return <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><section className={cn("modal-card", narrow && "narrow")} role="dialog" aria-modal="true" aria-label={title}><header><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="关闭"><X size={20} /></button></header>{children}</section></div>;
}

function StatusBadge({ status }: { status: string }) {
  return <span className={cn("status-badge", status.includes("完成") && !status.includes("未") && "success", (status.includes("待") || status === "计时中") && "warning", (status.includes("拒绝") || status.includes("未完成") || status === "已停用") && "muted")}>{status}</span>;
}

function EmptyState({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return <div className="empty-state"><span>{icon}</span><strong>{title}</strong><p>{text}</p></div>;
}
