-- 假期成长计划：家长确认任务时可调整实际奖励星星
-- 适用于已经执行 schema.sql 和 migration-add-task-penalties.sql 的数据库。
-- 可在 Supabase SQL Editor 中重复执行，不会删除旧任务或旧流水。

begin;

alter table public.tasks
  add column if not exists star_awarded integer
  check (star_awarded between 0 and 999);

-- 删除旧的一参数版本，改为带默认参数的新版本；旧客户端只传 task_id 仍可继续使用。
drop function if exists public.approve_task(uuid);

create or replace function public.approve_task(
  p_task_id uuid,
  p_awarded_stars integer default null,
  p_reason text default null
)
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
  v_requested_stars integer;
  v_star_amount integer;
  v_game_amount integer;
  v_adjustment_note text;
  v_transaction_reason text;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  select * into v_task
  from public.tasks
  where id = p_task_id and user_id = v_user
  for update;
  if not found then raise exception 'task not found'; end if;

  -- 同一任务确认多次也不会重复发放。
  if v_task.reward_granted then
    update public.tasks
    set status = '已完成', approved_at = coalesce(approved_at, now())
    where id = v_task.id
    returning * into v_task;
    return v_task;
  end if;
  if v_task.status <> '待家长确认' then
    raise exception 'task is not waiting for approval';
  end if;

  v_requested_stars := coalesce(p_awarded_stars, v_task.star_reward);
  if v_requested_stars < 0 or v_requested_stars > v_task.star_reward then
    raise exception 'awarded stars must be between 0 and task reward';
  end if;
  if v_requested_stars < v_task.star_reward
     and char_length(trim(coalesce(p_reason, ''))) < 2 then
    raise exception 'adjustment reason required';
  end if;

  v_adjustment_note := case
    when v_requested_stars < v_task.star_reward then left(trim(p_reason), 300)
    else null
  end;

  select * into v_profile
  from public.profiles
  where user_id = v_user
  for update;

  select coalesce(sum(greatest(amount, 0)), 0)
  into v_today_earned
  from public.point_transactions
  where user_id = v_user
    and created_at >= (public.family_today()::timestamp at time zone v_profile.timezone)
    and created_at < ((public.family_today() + 1)::timestamp at time zone v_profile.timezone);

  v_star_amount := least(
    v_requested_stars,
    greatest(v_profile.daily_points_cap - v_today_earned, 0)
  );
  v_transaction_reason := case
    when v_requested_stars < v_task.star_reward then
      left(
        v_task.title || '（原定 ' || v_task.star_reward || ' 星，实际 '
        || v_star_amount || ' 星：' || v_adjustment_note || '）',
        200
      )
    else v_task.title
  end;

  v_profile.stars_balance := v_profile.stars_balance + v_star_amount;
  update public.profiles
  set stars_balance = v_profile.stars_balance
  where user_id = v_user;

  if v_star_amount > 0 then
    insert into public.point_transactions
      (user_id, task_id, amount, reason, transaction_type, operator, balance_after)
    values
      (v_user, v_task.id, v_star_amount, v_transaction_reason,
       '完成任务奖励', '家长', v_profile.stars_balance);
  end if;

  -- 游戏时间仍按任务原设置发放，并继续受每日最大游戏时间限制。
  perform public.ensure_today_game_record();
  select * into v_record
  from public.game_time_records
  where user_id = v_user and record_date = public.family_today()
  for update;

  v_game_amount := least(
    v_task.game_minutes_reward,
    greatest(v_profile.max_game_minutes - v_record.base_minutes - v_record.earned_minutes, 0)
  );
  if v_game_amount > 0 then
    update public.game_time_records
    set earned_minutes = earned_minutes + v_game_amount
    where id = v_record.id
    returning * into v_record;

    insert into public.game_time_transactions
      (user_id, task_id, record_date, minutes, reason, transaction_type, operator, available_minutes_after)
    values
      (v_user, v_task.id, public.family_today(), v_game_amount, v_task.title,
       '任务奖励', '家长',
       least(v_profile.max_game_minutes, v_record.base_minutes + v_record.earned_minutes)
       + v_record.manual_adjustment);
  end if;

  update public.tasks
  set status = '已完成',
      approved_at = now(),
      reward_granted = true,
      star_awarded = v_star_amount,
      parent_note = v_adjustment_note
  where id = v_task.id
  returning * into v_task;

  return v_task;
end;
$$;

-- 实际发放数只能由事务函数写入，前端不能直接篡改。
revoke update (star_awarded) on public.tasks from authenticated;
revoke execute on function public.approve_task(uuid, integer, text) from public, anon;
grant execute on function public.approve_task(uuid, integer, text) to authenticated;

commit;
