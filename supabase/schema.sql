-- VERSION: 2026-07-14-pgcrypto-v2
-- 假期成长计划：Supabase 全量初始化脚本
-- 在一个全新的 Supabase 项目的 SQL Editor 中完整执行一次。

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  child_name text not null default '小朋友' check (char_length(child_name) <= 20),
  avatar_url text,
  holiday_start date,
  holiday_end date,
  timezone text not null default 'Asia/Shanghai' check (char_length(timezone) between 1 and 64),
  stars_balance integer not null default 0 check (stars_balance >= 0),
  base_game_minutes integer not null default 30 check (base_game_minutes between 0 and 300),
  max_game_minutes integer not null default 90 check (max_game_minutes between 0 and 600),
  require_tasks_before_game boolean not null default true,
  streak_reward integer not null default 5 check (streak_reward between 0 and 100),
  daily_points_cap integer not null default 100 check (daily_points_cap between 1 and 1000),
  holiday_goals text[] not null default '{}',
  parent_pin_hash text,
  parent_pin_set boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (holiday_end is null or holiday_start is null or holiday_end >= holiday_start),
  check (max_game_minutes >= base_game_minutes)
);

-- 兼容在旧版脚本上增量升级的账号。
alter table public.profiles add column if not exists timezone text not null default 'Asia/Shanghai';

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  series_id uuid,
  title text not null check (char_length(title) between 1 and 80),
  description text not null default '' check (char_length(description) <= 300),
  category text not null default '学习' check (category in ('学习','阅读','运动','兴趣','家务','生活','娱乐','其他')),
  task_date date not null,
  start_time time,
  duration_minutes integer not null default 30 check (duration_minutes between 1 and 480),
  star_reward integer not null default 0 check (star_reward between 0 and 999),
  game_minutes_reward integer not null default 0 check (game_minutes_reward between 0 and 300),
  repeat_type text not null default '不重复' check (repeat_type in ('不重复','每天','周一至周五','每周指定日期')),
  weekdays smallint[] not null default '{}',
  require_parent_approval boolean not null default true,
  is_required boolean not null default false,
  is_active boolean not null default true,
  status text not null default '未开始' check (status in ('未开始','进行中','待家长确认','已完成','未完成')),
  completed_at timestamptz,
  approved_at timestamptz,
  reward_granted boolean not null default false,
  parent_note text check (char_length(parent_note) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.point_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  reward_redemption_id uuid,
  amount integer not null,
  reason text not null check (char_length(reason) between 1 and 200),
  transaction_type text not null check (transaction_type in ('完成任务奖励','连续打卡奖励','家长手动奖励','家长扣除','奖励兑换','数据修正')),
  operator text not null default '系统' check (operator in ('孩子','家长','系统')),
  balance_after integer not null check (balance_after >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.rewards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  description text not null default '' check (char_length(description) <= 240),
  cost integer not null check (cost > 0),
  category text not null default '其他' check (category in ('游戏','娱乐','食物','物品','亲子活动','自由选择','其他')),
  icon text not null default '🎁' check (char_length(icon) <= 8),
  is_active boolean not null default true,
  stock integer check (stock is null or stock >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reward_redemptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reward_id uuid not null references public.rewards(id) on delete restrict,
  cost integer not null check (cost > 0),
  status text not null default '待审核' check (status in ('待审核','已批准','已拒绝','待兑现','已完成')),
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  fulfilled_at timestamptz,
  parent_note text check (char_length(parent_note) <= 300)
);

alter table public.point_transactions
  drop constraint if exists point_transactions_reward_redemption_id_fkey;
alter table public.point_transactions
  add constraint point_transactions_reward_redemption_id_fkey
  foreign key (reward_redemption_id) references public.reward_redemptions(id) on delete set null;

create table if not exists public.game_time_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  record_date date not null default current_date,
  base_minutes integer not null default 0 check (base_minutes >= 0),
  earned_minutes integer not null default 0 check (earned_minutes >= 0),
  manual_adjustment integer not null default 0,
  used_seconds integer not null default 0 check (used_seconds >= 0),
  timer_started_at timestamptz,
  timer_status text not null default '未开始' check (timer_status in ('未开始','计时中','已暂停','已结束')),
  updated_at timestamptz not null default now(),
  unique (user_id, record_date)
);

create table if not exists public.game_time_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  record_date date not null default current_date,
  minutes integer not null,
  reason text not null check (char_length(reason) between 1 and 200),
  transaction_type text not null check (transaction_type in ('任务奖励','家长调整','数据修正')),
  operator text not null default '系统' check (operator in ('孩子','家长','系统')),
  available_minutes_after integer not null,
  created_at timestamptz not null default now()
);

create table if not exists public.daily_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  review_date date not null default current_date,
  mood text not null default '开心' check (mood in ('很开心','开心','一般','不开心')),
  child_proud_of text not null default '' check (char_length(child_proud_of) <= 160),
  child_difficulty text not null default '' check (char_length(child_difficulty) <= 160),
  child_tomorrow_goal text not null default '' check (char_length(child_tomorrow_goal) <= 100),
  parent_comment text not null default '' check (char_length(parent_comment) <= 200),
  parent_suggestion text not null default '' check (char_length(parent_suggestion) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, review_date)
);

create index if not exists tasks_user_date_idx on public.tasks (user_id, task_date);
create index if not exists tasks_user_status_idx on public.tasks (user_id, status);
create index if not exists tasks_series_idx on public.tasks (series_id) where series_id is not null;
create index if not exists point_transactions_user_created_idx on public.point_transactions (user_id, created_at desc);
create index if not exists rewards_user_active_idx on public.rewards (user_id, is_active);
create index if not exists redemptions_user_status_idx on public.reward_redemptions (user_id, status, requested_at desc);
create index if not exists game_records_user_date_idx on public.game_time_records (user_id, record_date desc);
create index if not exists game_transactions_user_created_idx on public.game_time_transactions (user_id, created_at desc);
create index if not exists reviews_user_date_idx on public.daily_reviews (user_id, review_date desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at before update on public.tasks for each row execute function public.set_updated_at();
drop trigger if exists rewards_set_updated_at on public.rewards;
create trigger rewards_set_updated_at before update on public.rewards for each row execute function public.set_updated_at();
drop trigger if exists game_records_set_updated_at on public.game_time_records;
create trigger game_records_set_updated_at before update on public.game_time_records for each row execute function public.set_updated_at();
drop trigger if exists reviews_set_updated_at on public.daily_reviews;
create trigger reviews_set_updated_at before update on public.daily_reviews for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- 为执行脚本前已经存在的账号补建 profile。
insert into public.profiles (user_id)
select id from auth.users
on conflict (user_id) do nothing;

create or replace function public.current_user_id()
returns uuid
language sql
stable
as $$ select auth.uid() $$;

-- 所有“今日”计算都使用家庭最近登录设备的 IANA 时区，避免 UTC 跨日。
create or replace function public.family_today()
returns date
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select (now() at time zone coalesce((select p.timezone from public.profiles p where p.user_id = auth.uid()), 'Asia/Shanghai'))::date
$$;

create or replace function public.ensure_today_game_record()
returns public.game_time_records
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_base integer;
  v_record public.game_time_records;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select base_game_minutes into v_base from public.profiles where user_id = v_user;
  insert into public.game_time_records (user_id, record_date, base_minutes)
  values (v_user, public.family_today(), coalesce(v_base, 0))
  on conflict (user_id, record_date) do update
    set base_minutes = excluded.base_minutes
  returning * into v_record;
  return v_record;
end;
$$;

create or replace function public.submit_task_completion(p_task_id uuid)
returns public.tasks
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_task public.tasks;
  v_profile public.profiles;
  v_record public.game_time_records;
  v_today_earned integer;
  v_star_amount integer;
  v_game_amount integer;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_task from public.tasks where id = p_task_id and user_id = v_user for update;
  if not found then raise exception 'task not found'; end if;
  if not v_task.is_active then raise exception 'task disabled'; end if;
  if v_task.reward_granted then
    update public.tasks set status = '已完成', completed_at = coalesce(completed_at, now()) where id = v_task.id returning * into v_task;
    return v_task;
  end if;
  if v_task.status in ('待家长确认','已完成') then return v_task; end if;
  if v_task.require_parent_approval then
    update public.tasks set status = '待家长确认', completed_at = now(), parent_note = null where id = v_task.id returning * into v_task;
    return v_task;
  end if;

  select * into v_profile from public.profiles where user_id = v_user for update;
  select coalesce(sum(greatest(amount, 0)), 0) into v_today_earned
  from public.point_transactions where user_id = v_user
    and created_at >= (public.family_today()::timestamp at time zone v_profile.timezone)
    and created_at < ((public.family_today() + 1)::timestamp at time zone v_profile.timezone);
  v_star_amount := least(v_task.star_reward, greatest(v_profile.daily_points_cap - v_today_earned, 0));
  v_profile.stars_balance := v_profile.stars_balance + v_star_amount;
  update public.profiles set stars_balance = v_profile.stars_balance where user_id = v_user;
  if v_star_amount > 0 then
    insert into public.point_transactions (user_id, task_id, amount, reason, transaction_type, operator, balance_after)
    values (v_user, v_task.id, v_star_amount, v_task.title, '完成任务奖励', '系统', v_profile.stars_balance);
  end if;

  perform public.ensure_today_game_record();
  select * into v_record from public.game_time_records where user_id = v_user and record_date = public.family_today() for update;
  v_game_amount := least(v_task.game_minutes_reward, greatest(v_profile.max_game_minutes - v_record.base_minutes - v_record.earned_minutes, 0));
  if v_game_amount > 0 then
    update public.game_time_records set earned_minutes = earned_minutes + v_game_amount where id = v_record.id returning * into v_record;
    insert into public.game_time_transactions (user_id, task_id, record_date, minutes, reason, transaction_type, operator, available_minutes_after)
    values (v_user, v_task.id, public.family_today(), v_game_amount, v_task.title, '任务奖励', '系统', least(v_profile.max_game_minutes, v_record.base_minutes + v_record.earned_minutes) + v_record.manual_adjustment);
  end if;
  update public.tasks set status = '已完成', completed_at = now(), approved_at = now(), reward_granted = true where id = v_task.id returning * into v_task;
  return v_task;
end;
$$;

create or replace function public.approve_task(p_task_id uuid)
returns public.tasks
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_task public.tasks;
  v_profile public.profiles;
  v_record public.game_time_records;
  v_today_earned integer;
  v_star_amount integer;
  v_game_amount integer;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_task from public.tasks where id = p_task_id and user_id = v_user for update;
  if not found then raise exception 'task not found'; end if;
  if v_task.reward_granted then
    update public.tasks set status = '已完成', approved_at = coalesce(approved_at, now()) where id = v_task.id returning * into v_task;
    return v_task;
  end if;
  if v_task.status <> '待家长确认' then raise exception 'task is not waiting for approval'; end if;
  select * into v_profile from public.profiles where user_id = v_user for update;
  select coalesce(sum(greatest(amount, 0)), 0) into v_today_earned
  from public.point_transactions where user_id = v_user
    and created_at >= (public.family_today()::timestamp at time zone v_profile.timezone)
    and created_at < ((public.family_today() + 1)::timestamp at time zone v_profile.timezone);
  v_star_amount := least(v_task.star_reward, greatest(v_profile.daily_points_cap - v_today_earned, 0));
  v_profile.stars_balance := v_profile.stars_balance + v_star_amount;
  update public.profiles set stars_balance = v_profile.stars_balance where user_id = v_user;
  if v_star_amount > 0 then
    insert into public.point_transactions (user_id, task_id, amount, reason, transaction_type, operator, balance_after)
    values (v_user, v_task.id, v_star_amount, v_task.title, '完成任务奖励', '家长', v_profile.stars_balance);
  end if;
  perform public.ensure_today_game_record();
  select * into v_record from public.game_time_records where user_id = v_user and record_date = public.family_today() for update;
  v_game_amount := least(v_task.game_minutes_reward, greatest(v_profile.max_game_minutes - v_record.base_minutes - v_record.earned_minutes, 0));
  if v_game_amount > 0 then
    update public.game_time_records set earned_minutes = earned_minutes + v_game_amount where id = v_record.id returning * into v_record;
    insert into public.game_time_transactions (user_id, task_id, record_date, minutes, reason, transaction_type, operator, available_minutes_after)
    values (v_user, v_task.id, public.family_today(), v_game_amount, v_task.title, '任务奖励', '家长', least(v_profile.max_game_minutes, v_record.base_minutes + v_record.earned_minutes) + v_record.manual_adjustment);
  end if;
  update public.tasks set status = '已完成', approved_at = now(), reward_granted = true, parent_note = null where id = v_task.id returning * into v_task;
  return v_task;
end;
$$;

create or replace function public.reject_task_completion(p_task_id uuid, p_note text default null)
returns public.tasks
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_task public.tasks;
begin
  update public.tasks set status = '未完成', parent_note = left(coalesce(p_note, ''), 300)
  where id = p_task_id and user_id = auth.uid() and status = '待家长确认'
  returning * into v_task;
  if not found then raise exception 'task not found or not pending'; end if;
  return v_task;
end;
$$;

create or replace function public.adjust_points(p_amount integer, p_reason text)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_user uuid := auth.uid(); v_balance integer;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if p_amount = 0 then raise exception 'amount cannot be zero'; end if;
  if char_length(trim(p_reason)) < 2 then raise exception 'reason required'; end if;
  select stars_balance into v_balance from public.profiles where user_id = v_user for update;
  if v_balance + p_amount < 0 then raise exception 'points cannot be negative'; end if;
  v_balance := v_balance + p_amount;
  update public.profiles set stars_balance = v_balance where user_id = v_user;
  insert into public.point_transactions (user_id, amount, reason, transaction_type, operator, balance_after)
  values (v_user, p_amount, left(trim(p_reason), 200), case when p_amount > 0 then '家长手动奖励' else '家长扣除' end, '家长', v_balance);
  return v_balance;
end;
$$;

create or replace function public.request_reward_redemption(p_reward_id uuid)
returns public.reward_redemptions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_user uuid := auth.uid(); v_reward public.rewards; v_balance integer; v_redemption public.reward_redemptions;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_reward from public.rewards where id = p_reward_id and user_id = v_user;
  if not found or not v_reward.is_active then raise exception 'reward unavailable'; end if;
  if v_reward.stock = 0 then raise exception 'reward out of stock'; end if;
  select stars_balance into v_balance from public.profiles where user_id = v_user;
  if v_balance < v_reward.cost then raise exception 'not enough points'; end if;
  insert into public.reward_redemptions (user_id, reward_id, cost)
  values (v_user, v_reward.id, v_reward.cost) returning * into v_redemption;
  return v_redemption;
end;
$$;

create or replace function public.review_reward_redemption(p_redemption_id uuid, p_decision text, p_note text default null)
returns public.reward_redemptions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_user uuid := auth.uid(); v_redemption public.reward_redemptions; v_balance integer; v_stock integer;
begin
  if p_decision not in ('approve','reject') then raise exception 'invalid decision'; end if;
  select * into v_redemption from public.reward_redemptions where id = p_redemption_id and user_id = v_user for update;
  if not found or v_redemption.status <> '待审核' then raise exception 'redemption is not pending'; end if;
  if p_decision = 'reject' then
    update public.reward_redemptions set status = '已拒绝', parent_note = left(coalesce(p_note, ''), 300)
    where id = v_redemption.id returning * into v_redemption;
    return v_redemption;
  end if;
  select stars_balance into v_balance from public.profiles where user_id = v_user for update;
  if v_balance < v_redemption.cost then raise exception 'not enough points'; end if;
  select stock into v_stock from public.rewards where id = v_redemption.reward_id and user_id = v_user for update;
  if v_stock = 0 then raise exception 'reward out of stock'; end if;
  v_balance := v_balance - v_redemption.cost;
  update public.profiles set stars_balance = v_balance where user_id = v_user;
  if v_stock is not null then update public.rewards set stock = stock - 1 where id = v_redemption.reward_id; end if;
  update public.reward_redemptions set status = '待兑现', approved_at = now(), parent_note = left(coalesce(p_note, ''), 300)
  where id = v_redemption.id returning * into v_redemption;
  insert into public.point_transactions (user_id, reward_redemption_id, amount, reason, transaction_type, operator, balance_after)
  select v_user, v_redemption.id, -v_redemption.cost, '兑换：' || r.title, '奖励兑换', '家长', v_balance
  from public.rewards r where r.id = v_redemption.reward_id;
  return v_redemption;
end;
$$;

create or replace function public.fulfill_reward_redemption(p_redemption_id uuid)
returns public.reward_redemptions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_redemption public.reward_redemptions;
begin
  update public.reward_redemptions set status = '已完成', fulfilled_at = now()
  where id = p_redemption_id and user_id = auth.uid() and status in ('待兑现','已批准')
  returning * into v_redemption;
  if not found then raise exception 'redemption cannot be fulfilled'; end if;
  return v_redemption;
end;
$$;

create or replace function public.delete_or_disable_reward(p_reward_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (select 1 from public.reward_redemptions where reward_id = p_reward_id and user_id = auth.uid()) then
    update public.rewards set is_active = false where id = p_reward_id and user_id = auth.uid();
    return 'disabled';
  end if;
  delete from public.rewards where id = p_reward_id and user_id = auth.uid();
  if not found then raise exception 'reward not found'; end if;
  return 'deleted';
end;
$$;

create or replace function public.start_game_timer()
returns public.game_time_records
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_user uuid := auth.uid(); v_record public.game_time_records; v_profile public.profiles; v_available integer;
begin
  perform public.ensure_today_game_record();
  select * into v_profile from public.profiles where user_id = v_user;
  if v_profile.require_tasks_before_game and exists (
    select 1 from public.tasks where user_id = v_user and task_date = public.family_today() and is_active and is_required and status <> '已完成'
  ) then raise exception 'required tasks are not complete'; end if;
  select * into v_record from public.game_time_records where user_id = v_user and record_date = public.family_today() for update;
  v_available := greatest(least(v_profile.max_game_minutes, v_record.base_minutes + v_record.earned_minutes) + v_record.manual_adjustment, 0);
  if v_record.used_seconds >= v_available * 60 then raise exception 'no game time remaining'; end if;
  if v_record.timer_status <> '计时中' then
    update public.game_time_records set timer_started_at = now(), timer_status = '计时中' where id = v_record.id returning * into v_record;
  end if;
  return v_record;
end;
$$;

create or replace function public.finish_game_timer(p_status text)
returns public.game_time_records
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_user uuid := auth.uid(); v_record public.game_time_records; v_profile public.profiles; v_elapsed integer; v_available integer;
begin
  if p_status not in ('已暂停','已结束') then raise exception 'invalid timer status'; end if;
  select * into v_record from public.game_time_records where user_id = v_user and record_date = public.family_today() for update;
  if not found then raise exception 'game record not found'; end if;
  select * into v_profile from public.profiles where user_id = v_user;
  v_elapsed := case when v_record.timer_status = '计时中' and v_record.timer_started_at is not null then greatest(extract(epoch from (now() - v_record.timer_started_at))::integer, 0) else 0 end;
  v_available := greatest(least(v_profile.max_game_minutes, v_record.base_minutes + v_record.earned_minutes) + v_record.manual_adjustment, 0);
  update public.game_time_records
  set used_seconds = least(used_seconds + v_elapsed, v_available * 60), timer_started_at = null, timer_status = p_status
  where id = v_record.id returning * into v_record;
  return v_record;
end;
$$;

create or replace function public.pause_game_timer()
returns public.game_time_records
language sql
security definer
set search_path = public, pg_temp
as $$ select public.finish_game_timer('已暂停') $$;

create or replace function public.stop_game_timer()
returns public.game_time_records
language sql
security definer
set search_path = public, pg_temp
as $$ select public.finish_game_timer('已结束') $$;

create or replace function public.adjust_game_time(p_minutes integer, p_reason text)
returns public.game_time_records
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_user uuid := auth.uid(); v_record public.game_time_records; v_profile public.profiles; v_available integer;
begin
  if p_minutes = 0 then raise exception 'minutes cannot be zero'; end if;
  if char_length(trim(p_reason)) < 2 then raise exception 'reason required'; end if;
  perform public.ensure_today_game_record();
  select * into v_profile from public.profiles where user_id = v_user;
  select * into v_record from public.game_time_records where user_id = v_user and record_date = public.family_today() for update;
  v_available := least(v_profile.max_game_minutes, v_record.base_minutes + v_record.earned_minutes) + v_record.manual_adjustment + p_minutes;
  if v_available < ceil(v_record.used_seconds / 60.0) then raise exception 'available time cannot be less than used time'; end if;
  update public.game_time_records set manual_adjustment = manual_adjustment + p_minutes where id = v_record.id returning * into v_record;
  insert into public.game_time_transactions (user_id, record_date, minutes, reason, transaction_type, operator, available_minutes_after)
  values (v_user, public.family_today(), p_minutes, left(trim(p_reason), 200), '家长调整', '家长', v_available);
  return v_record;
end;
$$;

create or replace function public.set_parent_pin(p_pin text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_pin !~ '^\d{4}$' then raise exception 'pin must be four digits'; end if;
  update public.profiles
  set parent_pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf')),
      parent_pin_set = true
  where user_id = auth.uid();
  return found;
end;
$$;

create or replace function public.verify_parent_pin(p_pin text)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  select coalesce(parent_pin_hash = extensions.crypt(p_pin, parent_pin_hash), false)
  from public.profiles where user_id = auth.uid()
$$;

create or replace function public.reset_family_data(p_kind text, p_pin text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_user uuid := auth.uid(); v_balance integer;
begin
  if not coalesce(public.verify_parent_pin(p_pin), false) then raise exception 'invalid parent pin'; end if;
  if p_kind = 'today' then
    update public.tasks set status = '未开始', completed_at = null, approved_at = null, parent_note = null
    where user_id = v_user and task_date = public.family_today();
  elsif p_kind = 'stars' then
    select stars_balance into v_balance from public.profiles where user_id = v_user for update;
    update public.profiles set stars_balance = 0 where user_id = v_user;
    if v_balance <> 0 then
      insert into public.point_transactions (user_id, amount, reason, transaction_type, operator, balance_after)
      values (v_user, -v_balance, '家长重置星星余额', '数据修正', '家长', 0);
    end if;
  elsif p_kind = 'game' then
    update public.game_time_records set earned_minutes = 0, manual_adjustment = 0, used_seconds = 0, timer_started_at = null, timer_status = '未开始'
    where user_id = v_user and record_date = public.family_today();
    insert into public.game_time_transactions (user_id, record_date, minutes, reason, transaction_type, operator, available_minutes_after)
    select v_user, public.family_today(), 0, '家长重置今日游戏时间', '数据修正', '家长', base_minutes
    from public.game_time_records where user_id = v_user and record_date = public.family_today();
  elsif p_kind = 'all' then
    delete from public.point_transactions where user_id = v_user;
    delete from public.game_time_transactions where user_id = v_user;
    delete from public.reward_redemptions where user_id = v_user;
    delete from public.rewards where user_id = v_user;
    delete from public.daily_reviews where user_id = v_user;
    delete from public.game_time_records where user_id = v_user;
    delete from public.tasks where user_id = v_user;
    update public.profiles set stars_balance = 0, holiday_goals = '{}' where user_id = v_user;
  else
    raise exception 'invalid reset kind';
  end if;
  return true;
end;
$$;

-- RLS：每张表都按 auth.uid() 隔离家庭数据。
alter table public.profiles enable row level security;
alter table public.tasks enable row level security;
alter table public.point_transactions enable row level security;
alter table public.rewards enable row level security;
alter table public.reward_redemptions enable row level security;
alter table public.game_time_records enable row level security;
alter table public.game_time_transactions enable row level security;
alter table public.daily_reviews enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select using (auth.uid() = user_id);
drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles for insert with check (auth.uid() = user_id);
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists tasks_select_own on public.tasks;
create policy tasks_select_own on public.tasks for select using (auth.uid() = user_id);
drop policy if exists tasks_insert_own on public.tasks;
create policy tasks_insert_own on public.tasks for insert with check (auth.uid() = user_id);
drop policy if exists tasks_update_own on public.tasks;
create policy tasks_update_own on public.tasks for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists tasks_delete_own on public.tasks;
create policy tasks_delete_own on public.tasks for delete using (auth.uid() = user_id);

drop policy if exists point_transactions_select_own on public.point_transactions;
create policy point_transactions_select_own on public.point_transactions for select using (auth.uid() = user_id);

drop policy if exists rewards_select_own on public.rewards;
create policy rewards_select_own on public.rewards for select using (auth.uid() = user_id);
drop policy if exists rewards_insert_own on public.rewards;
create policy rewards_insert_own on public.rewards for insert with check (auth.uid() = user_id);
drop policy if exists rewards_update_own on public.rewards;
create policy rewards_update_own on public.rewards for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists rewards_delete_own on public.rewards;
create policy rewards_delete_own on public.rewards for delete using (auth.uid() = user_id);

drop policy if exists redemptions_select_own on public.reward_redemptions;
create policy redemptions_select_own on public.reward_redemptions for select using (auth.uid() = user_id);
drop policy if exists game_records_select_own on public.game_time_records;
create policy game_records_select_own on public.game_time_records for select using (auth.uid() = user_id);
drop policy if exists game_transactions_select_own on public.game_time_transactions;
create policy game_transactions_select_own on public.game_time_transactions for select using (auth.uid() = user_id);

drop policy if exists reviews_select_own on public.daily_reviews;
create policy reviews_select_own on public.daily_reviews for select using (auth.uid() = user_id);
drop policy if exists reviews_insert_own on public.daily_reviews;
create policy reviews_insert_own on public.daily_reviews for insert with check (auth.uid() = user_id);
drop policy if exists reviews_update_own on public.daily_reviews;
create policy reviews_update_own on public.daily_reviews for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists reviews_delete_own on public.daily_reviews;
create policy reviews_delete_own on public.daily_reviews for delete using (auth.uid() = user_id);

-- 最小权限：余额、PIN、流水、兑换状态和计时状态只能通过上面的事务函数改变。
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant insert (user_id) on public.profiles to authenticated;
grant update (child_name, avatar_url, holiday_start, holiday_end, timezone, base_game_minutes, max_game_minutes, require_tasks_before_game, streak_reward, daily_points_cap, holiday_goals) on public.profiles to authenticated;

revoke all on public.tasks from anon, authenticated;
grant select, insert, update, delete on public.tasks to authenticated;
revoke update (user_id, reward_granted, completed_at, approved_at) on public.tasks from authenticated;

revoke all on public.point_transactions from anon, authenticated;
grant select on public.point_transactions to authenticated;
revoke all on public.rewards from anon, authenticated;
grant select, insert, update, delete on public.rewards to authenticated;
revoke update (user_id) on public.rewards from authenticated;
revoke all on public.reward_redemptions from anon, authenticated;
grant select on public.reward_redemptions to authenticated;
revoke all on public.game_time_records from anon, authenticated;
grant select on public.game_time_records to authenticated;
revoke all on public.game_time_transactions from anon, authenticated;
grant select on public.game_time_transactions to authenticated;
revoke all on public.daily_reviews from anon, authenticated;
grant select, insert, update, delete on public.daily_reviews to authenticated;
revoke update (user_id) on public.daily_reviews from authenticated;

revoke execute on function public.ensure_today_game_record() from public, anon;
revoke execute on function public.family_today() from public, anon;
revoke execute on function public.submit_task_completion(uuid) from public, anon;
revoke execute on function public.approve_task(uuid) from public, anon;
revoke execute on function public.reject_task_completion(uuid, text) from public, anon;
revoke execute on function public.adjust_points(integer, text) from public, anon;
revoke execute on function public.request_reward_redemption(uuid) from public, anon;
revoke execute on function public.review_reward_redemption(uuid, text, text) from public, anon;
revoke execute on function public.fulfill_reward_redemption(uuid) from public, anon;
revoke execute on function public.delete_or_disable_reward(uuid) from public, anon;
revoke execute on function public.start_game_timer() from public, anon;
revoke execute on function public.pause_game_timer() from public, anon;
revoke execute on function public.stop_game_timer() from public, anon;
revoke execute on function public.adjust_game_time(integer, text) from public, anon;
revoke execute on function public.set_parent_pin(text) from public, anon;
revoke execute on function public.verify_parent_pin(text) from public, anon;
revoke execute on function public.reset_family_data(text, text) from public, anon;

grant execute on function public.ensure_today_game_record() to authenticated;
grant execute on function public.submit_task_completion(uuid) to authenticated;
grant execute on function public.approve_task(uuid) to authenticated;
grant execute on function public.reject_task_completion(uuid, text) to authenticated;
grant execute on function public.adjust_points(integer, text) to authenticated;
grant execute on function public.request_reward_redemption(uuid) to authenticated;
grant execute on function public.review_reward_redemption(uuid, text, text) to authenticated;
grant execute on function public.fulfill_reward_redemption(uuid) to authenticated;
grant execute on function public.delete_or_disable_reward(uuid) to authenticated;
grant execute on function public.start_game_timer() to authenticated;
grant execute on function public.pause_game_timer() to authenticated;
grant execute on function public.stop_game_timer() to authenticated;
grant execute on function public.adjust_game_time(integer, text) to authenticated;
grant execute on function public.set_parent_pin(text) to authenticated;
grant execute on function public.verify_parent_pin(text) to authenticated;
grant execute on function public.reset_family_data(text, text) to authenticated;
revoke execute on function public.finish_game_timer(text) from public, anon, authenticated;

-- 实时同步所需设置；重复执行脚本不会报错。
alter table public.profiles replica identity full;
alter table public.tasks replica identity full;
alter table public.point_transactions replica identity full;
alter table public.rewards replica identity full;
alter table public.reward_redemptions replica identity full;
alter table public.game_time_records replica identity full;
alter table public.daily_reviews replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.profiles;
exception when duplicate_object then null;
end $$;
do $$ begin alter publication supabase_realtime add table public.tasks; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.point_transactions; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.rewards; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.reward_redemptions; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.game_time_records; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.daily_reviews; exception when duplicate_object then null; end $$;
