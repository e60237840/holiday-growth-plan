import type { AppData } from "./types";

const iso = (date: Date) => date.toLocaleDateString("en-CA");
const now = new Date();
const today = iso(now);
const weekAgo = new Date(now);
weekAgo.setDate(now.getDate() - 6);

export function createDemoData(): AppData {
  return {
    profile: {
      id: "demo-profile",
      user_id: "demo-user",
      child_name: "小宇",
      avatar_url: null,
      holiday_start: iso(weekAgo),
      holiday_end: iso(new Date(now.getFullYear(), now.getMonth() + 1, now.getDate())),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai",
      stars_balance: 126,
      base_game_minutes: 30,
      max_game_minutes: 90,
      require_tasks_before_game: true,
      streak_reward: 5,
      daily_points_cap: 100,
      parent_pin_set: true,
      holiday_goals: ["坚持每天阅读", "学会自由泳换气", "自己整理房间"],
    },
    tasks: [
      { id: "t1", user_id: "demo-user", series_id: null, title: "完成数学练习", description: "订正昨天的错题", category: "学习", task_date: today, start_time: "09:00", duration_minutes: 40, star_reward: 8, star_penalty: 4, game_minutes_reward: 10, repeat_type: "不重复", weekdays: [], require_parent_approval: true, is_required: true, is_active: true, status: "已完成", completed_at: new Date().toISOString(), approved_at: new Date().toISOString(), reward_granted: true, star_awarded: 8, penalty_applied: false, penalized_at: null, parent_note: null },
      { id: "t2", user_id: "demo-user", series_id: null, title: "阅读《昆虫记》", description: "阅读 20 页并说说最有趣的发现", category: "阅读", task_date: today, start_time: "10:20", duration_minutes: 30, star_reward: 6, star_penalty: 3, game_minutes_reward: 5, repeat_type: "不重复", weekdays: [], require_parent_approval: true, is_required: true, is_active: true, status: "待家长确认", completed_at: new Date().toISOString(), approved_at: null, reward_granted: false, star_awarded: null, penalty_applied: false, penalized_at: null, parent_note: null },
      { id: "t3", user_id: "demo-user", series_id: null, title: "户外运动", description: "跳绳或骑车，自选一项", category: "运动", task_date: today, start_time: "16:30", duration_minutes: 45, star_reward: 8, star_penalty: 4, game_minutes_reward: 10, repeat_type: "不重复", weekdays: [], require_parent_approval: true, is_required: false, is_active: true, status: "未开始", completed_at: null, approved_at: null, reward_granted: false, star_awarded: null, penalty_applied: false, penalized_at: null, parent_note: null },
      { id: "t4", user_id: "demo-user", series_id: null, title: "整理书桌", description: "物品归位，桌面擦干净", category: "家务", task_date: today, start_time: "19:30", duration_minutes: 15, star_reward: 4, star_penalty: 2, game_minutes_reward: 0, repeat_type: "不重复", weekdays: [], require_parent_approval: false, is_required: false, is_active: true, status: "未开始", completed_at: null, approved_at: null, reward_granted: false, star_awarded: null, penalty_applied: false, penalized_at: null, parent_note: null },
    ],
    points: [
      { id: "p1", user_id: "demo-user", task_id: "t1", amount: 8, reason: "完成数学练习", transaction_type: "完成任务奖励", operator: "家长", balance_after: 126, created_at: new Date().toISOString() },
    ],
    rewards: [
      { id: "r1", user_id: "demo-user", title: "周末电影之夜", description: "全家一起选一部电影", cost: 45, category: "亲子活动", icon: "🎬", is_active: true, stock: null },
      { id: "r2", user_id: "demo-user", title: "自选甜点", description: "选择一份喜欢的甜点", cost: 30, category: "食物", icon: "🍰", is_active: true, stock: 3 },
      { id: "r3", user_id: "demo-user", title: "额外游戏 30 分钟", description: "当日使用，不能跨天", cost: 35, category: "游戏", icon: "🎮", is_active: true, stock: null },
    ],
    redemptions: [],
    game: { id: "g1", user_id: "demo-user", record_date: today, base_minutes: 30, earned_minutes: 15, manual_adjustment: 0, used_seconds: 0, timer_started_at: null, timer_status: "未开始" },
    gameHistory: Array.from({ length: 7 }, (_, index) => {
      const date = new Date(now);
      date.setDate(now.getDate() - index);
      return { id: `g${index + 1}`, user_id: "demo-user", record_date: iso(date), base_minutes: 30, earned_minutes: index % 2 ? 10 : 15, manual_adjustment: 0, used_seconds: Math.max(0, 2400 - index * 240), timer_started_at: null, timer_status: "已结束" as const };
    }),
    reviews: [],
  };
}
