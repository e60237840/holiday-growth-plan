export type TaskCategory = "学习" | "阅读" | "运动" | "兴趣" | "家务" | "生活" | "娱乐" | "其他";
export type TaskStatus = "未开始" | "进行中" | "待家长确认" | "已完成" | "未完成";
export type RepeatType = "不重复" | "每天" | "周一至周五" | "每周指定日期";

export interface Profile {
  id: string;
  user_id: string;
  child_name: string;
  avatar_url: string | null;
  holiday_start: string | null;
  holiday_end: string | null;
  timezone: string;
  stars_balance: number;
  base_game_minutes: number;
  max_game_minutes: number;
  require_tasks_before_game: boolean;
  streak_reward: number;
  daily_points_cap: number;
  parent_pin_set: boolean;
  holiday_goals: string[];
}

export interface GrowthTask {
  id: string;
  user_id: string;
  series_id: string | null;
  title: string;
  description: string;
  category: TaskCategory;
  task_date: string;
  start_time: string | null;
  duration_minutes: number;
  star_reward: number;
  star_penalty: number;
  game_minutes_reward: number;
  repeat_type: RepeatType;
  weekdays: number[];
  require_parent_approval: boolean;
  is_required: boolean;
  is_active: boolean;
  status: TaskStatus;
  completed_at: string | null;
  approved_at: string | null;
  reward_granted: boolean;
  star_awarded: number | null;
  penalty_applied: boolean;
  penalized_at: string | null;
  parent_note: string | null;
  created_at?: string;
}

export interface PointTransaction {
  id: string;
  user_id: string;
  task_id: string | null;
  reward_redemption_id?: string | null;
  amount: number;
  reason: string;
  transaction_type: string;
  operator: string;
  balance_after: number;
  created_at: string;
}

export interface Reward {
  id: string;
  user_id: string;
  title: string;
  description: string;
  cost: number;
  category: string;
  icon: string;
  is_active: boolean;
  stock: number | null;
  game_minutes_reward: number;
  created_at?: string;
}

export interface Redemption {
  id: string;
  user_id: string;
  reward_id: string;
  cost: number;
  game_minutes_reward: number;
  status: "待审核" | "已批准" | "已拒绝" | "待兑现" | "已完成";
  requested_at: string;
  approved_at: string | null;
  fulfilled_at: string | null;
  parent_note: string | null;
}

export interface GameRecord {
  id: string;
  user_id: string;
  record_date: string;
  base_minutes: number;
  earned_minutes: number;
  manual_adjustment: number;
  used_seconds: number;
  timer_started_at: string | null;
  timer_status: "未开始" | "计时中" | "已暂停" | "已结束";
  updated_at?: string;
}

export interface DailyReview {
  id?: string;
  user_id?: string;
  review_date: string;
  mood: "很开心" | "开心" | "一般" | "不开心";
  child_proud_of: string;
  child_difficulty: string;
  child_tomorrow_goal: string;
  parent_comment: string;
  parent_suggestion: string;
}

export interface AppData {
  profile: Profile;
  tasks: GrowthTask[];
  points: PointTransaction[];
  rewards: Reward[];
  redemptions: Redemption[];
  game: GameRecord;
  gameHistory: GameRecord[];
  reviews: DailyReview[];
}
