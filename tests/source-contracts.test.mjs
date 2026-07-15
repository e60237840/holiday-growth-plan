import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const sql = await readFile(new URL("supabase/schema.sql", root), "utf8");
const worker = await readFile(new URL("worker/index.ts", root), "utf8");
const supabaseClient = await readFile(new URL("lib/supabase.ts", root), "utf8");
const css = await readFile(new URL("app/globals.css", root), "utf8");
const app = await readFile(new URL("app/holiday-growth-app.tsx", root), "utf8");

const tables = [
  "profiles",
  "tasks",
  "point_transactions",
  "rewards",
  "reward_redemptions",
  "game_time_records",
  "game_time_transactions",
  "daily_reviews",
];

test("all family data tables enable RLS", () => {
  for (const table of tables) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security;`, "i"), `${table} must enable RLS`);
  }
  assert.doesNotMatch(sql, /using\s*\(\s*true\s*\)|with check\s*\(\s*true\s*\)/i);
});

test("user-editable tables enforce auth.uid ownership", () => {
  for (const table of ["profiles", "tasks", "rewards", "daily_reviews"]) {
    assert.match(sql, new RegExp(`on public\\.${table}[\\s\\S]{0,180}auth\\.uid\\(\\) = user_id`, "i"));
  }
});

test("atomic flows lock rows and guard one-time rewards", () => {
  assert.match(sql, /function public\.approve_task[\s\S]*?for update;[\s\S]*?if v_task\.reward_granted then/i);
  assert.match(sql, /function public\.review_reward_redemption[\s\S]*?for update;[\s\S]*?status <> '待审核'/i);
  assert.match(sql, /check \(stars_balance >= 0\)/i);
  assert.match(sql, /function public\.finish_game_timer[\s\S]*?timer_started_at/i);
  assert.match(sql, /function public\.family_today\(\)[\s\S]*?at time zone/i);
  assert.match(sql, /extensions\.crypt\(p_pin, extensions\.gen_salt\('bf'\)\)/i);
  assert.match(sql, /extensions\.crypt\(p_pin, parent_pin_hash\)/i);
  assert.doesNotMatch(sql, /task_date\s*=\s*current_date/i);
});

test("task penalties are bounded, idempotent, and recorded", () => {
  assert.match(sql, /star_penalty integer not null default 0/i);
  assert.match(sql, /function public\.penalize_task[\s\S]*?for update;/i);
  assert.match(sql, /if v_task\.penalty_applied then return v_task/i);
  assert.match(sql, /least\(v_task\.star_penalty, v_balance\)/i);
  assert.match(sql, /'任务未完成扣除'/i);
  assert.match(app, /未完成扣除星星/);
  assert.match(app, /确认记录并扣星/);
});

test("parent approval can award a bounded custom amount exactly once", () => {
  assert.match(sql, /star_awarded integer check \(star_awarded between 0 and 999\)/i);
  assert.match(sql, /function public\.approve_task\([\s\S]*?p_awarded_stars integer default null/i);
  assert.match(sql, /v_requested_stars < 0 or v_requested_stars > v_task\.star_reward/i);
  assert.match(sql, /adjustment reason required/i);
  assert.match(sql, /v_star_amount := least\(v_requested_stars/i);
  assert.match(sql, /reward_granted = true,[\s\S]*?star_awarded = v_star_amount/i);
  assert.match(app, /确认并评分/);
  assert.match(app, /实际奖励星星/);
  assert.match(app, /这里只减少本次任务奖励/);
  assert.match(app, /p_awarded_stars: requestedStars/);
});

test("mobile layout uses bottom navigation and blocks horizontal overflow", () => {
  assert.match(css, /@media\s*\(max-width:\s*760px\)/i);
  assert.match(css, /overflow-x:\s*hidden/i);
  assert.match(css, /\.sidebar[\s\S]*?position:\s*fixed/i);
  assert.match(css, /\.main-area\s*\{[^}]*padding-bottom:\s*78px/i);
  assert.match(css, /\.bottom-nav\s*\{[^}]*height:\s*calc\([^)]*safe-area-inset-bottom/i);
});

test("client uses realtime sync and surfaces failures", () => {
  assert.match(app, /\.channel\(`growth-/);
  assert.match(app, /postgres_changes/);
  assert.match(app, /操作没有成功，请稍后重试/);
  assert.match(app, /function makeId\(\)/);
});

test("hosted client loads Supabase configuration from Worker runtime bindings", () => {
  assert.match(worker, /\/api\/supabase-config/);
  assert.match(worker, /NEXT_PUBLIC_SUPABASE_URL/);
  assert.match(worker, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  assert.match(supabaseClient, /initializeSupabase/);
  assert.match(supabaseClient, /fetch\("\/api\/supabase-config"/);
});
