# 假期成长计划

一套面向家庭使用的儿童假期成长管理系统。支持任务安排、家长确认、星星积分、游戏时间、奖励兑换、每日复盘和每周统计，并通过 Supabase 在手机与电脑之间实时同步。

## 已实现

- 邮箱注册与登录，所有数据按登录用户隔离
- 今日任务、创建/修改/删除/复制/顺延、重复任务
- 孩子提交、家长确认、星星与游戏时间一次性发放
- 任务可设置未完成扣星；家长填写原因后确认，最多扣到 0 且只执行一次
- 奖励管理、兑换申请、批准/拒绝、兑现记录
- 完整星星流水，余额不能为负数
- 游戏倒计时、暂停、结束和家长调整；刷新后继续
- 每日心情与亲子复盘、简单周统计
- 四位家长管理密码、数据导出和分级重置
- 电脑左侧导航、手机底部导航，无横向滚动

## 一、配置 Supabase

1. 创建一个 Supabase 项目。
2. 打开 **SQL Editor**，完整执行 [`supabase/schema.sql`](supabase/schema.sql)。
3. 复制 `.env.example` 为 `.env.local`。
4. 填写 Project URL 和 Publishable Key。

若数据库已经执行过旧版脚本，只需在 SQL Editor 中执行
[`supabase/migration-add-task-penalties.sql`](supabase/migration-add-task-penalties.sql)，
即可保留原有任务和记录并增加任务惩罚功能。

Publishable Key 会被前端使用，它不是服务端密钥。真正的数据安全由 SQL 中的 RLS、用户隔离策略和数据库事务函数保证。不要在本项目中使用 `service_role` 密钥。

## 二、本地运行

需要 Node.js 22 或更高版本：

```bash
npm install
npm run dev
```

若未创建 `.env.local`，网站会进入演示模式，方便先查看界面，但演示数据不会跨设备同步。

## 三、部署到 GitHub Pages

1. 将项目上传到 GitHub，并确保默认分支为 `main`。
2. 在仓库 **Settings → Secrets and variables → Actions** 中添加：
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
3. 在 **Settings → Pages → Build and deployment** 中选择 **GitHub Actions**。
4. 推送代码后，项目自带的工作流会自动构建和发布。

## 主要文件

- `app/holiday-growth-app.tsx`：业务交互和五个主页面
- `app/globals.css`：电脑/手机响应式界面
- `lib/supabase.ts`：Supabase 客户端配置
- `supabase/schema.sql`：数据表、索引、事务函数、RLS 和实时同步设置
- `.github/workflows/deploy-pages.yml`：GitHub Pages 自动部署

## 安全说明

- 每张业务表都启用了 RLS。
- 所有读取都要求 `user_id = auth.uid()`。
- 任务奖励、兑换扣分和游戏计时由数据库事务函数执行。
- 星星余额、PIN 哈希、积分流水和兑换状态不能由普通前端请求直接篡改。
- 家长 PIN 只保存 bcrypt 哈希，不保存明文。
