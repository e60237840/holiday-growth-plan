-- VERSION: 2026-07-15-reward-game-time-v1
-- 增量升级：游戏类奖励获批后，自动把兑换分钟加入当天游戏时间。
-- 可在 Supabase SQL Editor 中重复执行。

begin;

alter table public.rewards
  add column if not exists game_minutes_reward integer not null default 0;
alter table public.rewards
  drop constraint if exists rewards_game_minutes_reward_check;
alter table public.rewards
  add constraint rewards_game_minutes_reward_check
  check (game_minutes_reward between 0 and 600);

alter table public.reward_redemptions
  add column if not exists game_minutes_reward integer not null default 0;
alter table public.reward_redemptions
  drop constraint if exists reward_redemptions_game_minutes_reward_check;
alter table public.reward_redemptions
  add constraint reward_redemptions_game_minutes_reward_check
  check (game_minutes_reward between 0 and 600);

alter table public.game_time_transactions
  add column if not exists reward_redemption_id uuid;
alter table public.game_time_transactions
  drop constraint if exists game_time_transactions_reward_redemption_id_fkey;
alter table public.game_time_transactions
  add constraint game_time_transactions_reward_redemption_id_fkey
  foreign key (reward_redemption_id)
  references public.reward_redemptions(id)
  on delete set null;

alter table public.game_time_transactions
  drop constraint if exists game_time_transactions_transaction_type_check;
alter table public.game_time_transactions
  add constraint game_time_transactions_transaction_type_check
  check (transaction_type in ('任务奖励','奖励兑换','家长调整','数据修正'));

create unique index if not exists game_transactions_redemption_once_idx
  on public.game_time_transactions (reward_redemption_id)
  where reward_redemption_id is not null;

create or replace function public.request_reward_redemption(p_reward_id uuid)
returns public.reward_redemptions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_reward public.rewards;
  v_balance integer;
  v_redemption public.reward_redemptions;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_reward
  from public.rewards
  where id = p_reward_id and user_id = v_user;
  if not found or not v_reward.is_active then raise exception 'reward unavailable'; end if;
  if v_reward.stock = 0 then raise exception 'reward out of stock'; end if;
  select stars_balance into v_balance
  from public.profiles
  where user_id = v_user;
  if v_balance < v_reward.cost then raise exception 'not enough points'; end if;

  -- 保存申请当时的分钟数，后续修改奖励不会改变这次兑换。
  insert into public.reward_redemptions
    (user_id, reward_id, cost, game_minutes_reward)
  values
    (v_user, v_reward.id, v_reward.cost, v_reward.game_minutes_reward)
  returning * into v_redemption;
  return v_redemption;
end;
$$;

create or replace function public.review_reward_redemption(
  p_redemption_id uuid,
  p_decision text,
  p_note text default null
)
returns public.reward_redemptions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_redemption public.reward_redemptions;
  v_profile public.profiles;
  v_reward public.rewards;
  v_record public.game_time_records;
  v_balance integer;
  v_game_minutes integer;
  v_available integer;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if p_decision not in ('approve','reject') then raise exception 'invalid decision'; end if;

  select * into v_redemption
  from public.reward_redemptions
  where id = p_redemption_id and user_id = v_user
  for update;
  if not found or v_redemption.status <> '待审核' then
    raise exception 'redemption is not pending';
  end if;

  if p_decision = 'reject' then
    update public.reward_redemptions
    set status = '已拒绝', parent_note = left(coalesce(p_note, ''), 300)
    where id = v_redemption.id
    returning * into v_redemption;
    return v_redemption;
  end if;

  select * into v_profile
  from public.profiles
  where user_id = v_user
  for update;
  if not found then raise exception 'profile not found'; end if;
  v_balance := v_profile.stars_balance;
  if v_balance < v_redemption.cost then raise exception 'not enough points'; end if;

  select * into v_reward
  from public.rewards
  where id = v_redemption.reward_id and user_id = v_user
  for update;
  if not found then raise exception 'reward not found'; end if;
  if v_reward.stock = 0 then raise exception 'reward out of stock'; end if;

  v_game_minutes := v_redemption.game_minutes_reward;
  v_balance := v_balance - v_redemption.cost;
  update public.profiles
  set stars_balance = v_balance
  where user_id = v_user;

  if v_reward.stock is not null then
    update public.rewards
    set stock = stock - 1
    where id = v_redemption.reward_id;
  end if;

  update public.reward_redemptions
  set status = '待兑现',
      approved_at = now(),
      parent_note = left(coalesce(p_note, ''), 300)
  where id = v_redemption.id
  returning * into v_redemption;

  insert into public.point_transactions
    (user_id, reward_redemption_id, amount, reason, transaction_type, operator, balance_after)
  values
    (v_user, v_redemption.id, -v_redemption.cost, '兑换：' || v_reward.title, '奖励兑换', '家长', v_balance);

  if v_game_minutes > 0 then
    perform public.ensure_today_game_record();
    select * into v_record
    from public.game_time_records
    where user_id = v_user and record_date = public.family_today()
    for update;

    update public.game_time_records
    set manual_adjustment = manual_adjustment + v_game_minutes
    where id = v_record.id
    returning * into v_record;

    v_available := greatest(
      least(v_profile.max_game_minutes, v_record.base_minutes + v_record.earned_minutes)
        + v_record.manual_adjustment,
      0
    );

    insert into public.game_time_transactions
      (user_id, reward_redemption_id, record_date, minutes, reason, transaction_type, operator, available_minutes_after)
    values
      (v_user, v_redemption.id, public.family_today(), v_game_minutes,
       left('兑换奖励：' || v_reward.title, 200), '奖励兑换', '家长', v_available);
  end if;

  return v_redemption;
end;
$$;

revoke execute on function public.request_reward_redemption(uuid) from public, anon;
revoke execute on function public.review_reward_redemption(uuid, text, text) from public, anon;
grant execute on function public.request_reward_redemption(uuid) to authenticated;
grant execute on function public.review_reward_redemption(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';

commit;
