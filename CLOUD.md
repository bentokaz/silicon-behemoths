# Online saves (optional)

The game keeps saves in the browser and, if you choose one, in a sync folder.
Online accounts are a third, optional place. They need a free Supabase project.

## One-time setup (about ten minutes)

1. Create an account at https://supabase.com and make a new project (the free plan is enough).
2. In the project, open **SQL Editor**, paste the block below and run it.
3. Open **Project Settings > API**. Copy the **Project URL** and the **anon public** key.
4. Either
   - paste both into the game under **System > Saves and company > Saves beyond this browser > Online account**
     (this sets it up for you only, in this browser), or
   - to switch it on for everyone who plays your published copy, create a file named `.env` next to
     `package.json` containing

         VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
         VITE_SUPABASE_KEY=YOUR-ANON-PUBLIC-KEY

     and publish again (`npm run deploy`).
5. Optional: under **Authentication > Providers > Email**, turn off "Confirm email" so new players can
   sign in straight away.

The anon key is meant to be public. The rules below make sure each player can only read and write
their own saves.

```sql
create table if not exists saves (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  slot text not null,
  meta jsonb not null,
  state jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, slot)
);
alter table saves enable row level security;
create policy "own saves" on saves for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

## Running costs

The free plan allows 500 MB of database. A save is roughly 0.3 to 2 MB, so a few hundred players fit.
If the game becomes popular you would need to watch usage or limit slots per player.
