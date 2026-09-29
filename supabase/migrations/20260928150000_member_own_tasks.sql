-- Team members only see tasks assigned to them. Admins still see every task.
-- A member can add or update a task only when it is assigned to them and
-- they are on that wedding.

drop policy if exists tasks_select on public.tasks;
drop policy if exists tasks_write on public.tasks;
drop policy if exists tasks_update on public.tasks;

create policy tasks_select on public.tasks
  for select to authenticated
  using (public.is_admin() or assignee_id = auth.uid());

create policy tasks_write on public.tasks
  for insert to authenticated
  with check (
    public.is_admin()
    or (assignee_id = auth.uid() and public.is_assigned(wedding_id))
  );

create policy tasks_update on public.tasks
  for update to authenticated
  using (public.is_admin() or assignee_id = auth.uid())
  with check (
    public.is_admin()
    or (assignee_id = auth.uid() and public.is_assigned(wedding_id))
  );
