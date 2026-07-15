-- 假期成长计划：为已有数据库增加任务惩罚机制
-- 可在 Supabase SQL Editor 中重复执行。

begin;

alter table public.tasks
  add column if not exists star_penalty integer not null default 0
  check (star_penalty between 0 and 999);
alter table public.tasks
  add column if not exists penalty_applied boolean not null default false;
alter table public.tasks
  add column if not exists penalized_at timestamptz;

alter table public.point_transactions
  drop constraint if exists point_transactions_transaction_type_check;
alter table public.point_transactions
  add constraint point_transactions_transaction_type_check
  check (transaction_type in (
    '完成任务奖励',
    '任务未完成扣除',
    '连续打卡奖励',
    '家长手动奖励',
    '家长扣除',
    '奖励兑换',
    '数据修正'
  ));

create or replace function public.penalize_task(p_task_id uuid, p_result text, p_reason text)
returns public.tasks
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_task public.tasks;
  v_balance integer;
  v_deduction integer;
  v_reason text;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if p_result not in ('未完成', '未达标') then raise exception 'invalid task result'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 2 then raise exception 'reason required'; end if;

  select * into v_task
  from public.tasks
  where id = p_task_id and user_id = v_user
  for update;
  if not found then raise exception 'task not found'; end if;
  if v_task.reward_granted or v_task.status = '已完成' then raise exception 'completed task cannot be penalized'; end if;
  if v_task.penalty_applied then return v_task; end if;

  select stars_balance into v_balance
  from public.profiles
  where user_id = v_user
  for update;

  v_deduction := least(v_task.star_penalty, v_balance);
  v_balance := v_balance - v_deduction;
  v_reason := left(p_result || '：' || trim(p_reason), 200);

  if v_deduction > 0 then
    update public.profiles set stars_balance = v_balance where user_id = v_user;
    insert into public.point_transactions (user_id, task_id, amount, reason, transaction_type, operator, balance_after)
    values (v_user, v_task.id, -v_deduction, v_reason, '任务未完成扣除', '家长', v_balance);
  end if;

  update public.tasks
  set status = '未完成',
      parent_note = left(trim(p_reason), 300),
      penalty_applied = true,
      penalized_at = now()
  where id = v_task.id
  returning * into v_task;
  return v_task;
end;
$$;

revoke update (user_id, reward_granted, penalty_applied, completed_at, approved_at, penalized_at)
  on public.tasks from authenticated;
revoke execute on function public.penalize_task(uuid, text, text) from public, anon;
grant execute on function public.penalize_task(uuid, text, text) to authenticated;

commit;
