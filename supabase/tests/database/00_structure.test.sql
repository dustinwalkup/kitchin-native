-- Structural checks (4-test-plan §2.1, design §4.4 and §7). Task 4.1 adds the grocery grants below;
-- task 5.1 adds the broadcast trigger and DB-S-16.
-- Every query names its schema, so the local-only `tests` schema (§8.1) never counts.
begin;
select plan(16);

-- Everything `authenticated` may hold in public (design §4.4). Add rows when a migration adds a table.
create temporary table expected_authenticated_grants (table_name text, privilege text) on commit drop;
insert into expected_authenticated_grants values
  ('households', 'SELECT'), ('households', 'UPDATE'),
  ('household_members', 'SELECT');

-- Every privilege a role holds on a public relation, granted on the table, on any of its columns,
-- or to PUBLIC. MAINTAIN is new in Postgres 17.
create function pg_temp.public_privileges(p_role name)
returns table (table_name text, privilege text) language sql stable as $$
  select c.relname::text, t.privilege
    from pg_catalog.pg_class c
   cross join (values ('SELECT', true), ('INSERT', true), ('UPDATE', true), ('REFERENCES', true),
                      ('DELETE', false), ('TRUNCATE', false), ('TRIGGER', false), ('MAINTAIN', false))
         as t(privilege, column_level)
   where c.relnamespace = 'public'::regnamespace
     and c.relkind in ('r', 'p', 'v', 'm', 'f')
     and (pg_catalog.has_table_privilege(p_role, c.oid, t.privilege)
          or case when t.column_level then pg_catalog.has_any_column_privilege(p_role, c.oid, t.privilege)
                  else false end)
$$;

-- Tables

select is_empty(
  $$ select c.relname from pg_catalog.pg_class c
      where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') and not c.relrowsecurity $$,
  'DB-S-01 every public table has row security enabled');

select is_empty(
  $$ select c.relname from pg_catalog.pg_class c
      where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
        and c.relname not in ('households', 'household_members')
        and not exists (select 1 from pg_catalog.pg_attribute a
                         where a.attrelid = c.oid and a.attname = 'household_id' and not a.attisdropped
                           and a.atttypid = 'uuid'::regtype and a.attnotnull) $$,
  'DB-S-02 every public table except households and household_members has household_id uuid not null');

-- Audit columns live on household-data tables; household_members has none (design §4.3).
-- tgtype bits: 1 row, 2 before, 4 insert, 16 update.
select is_empty(
  $$ select c.relname from pg_catalog.pg_class c
      where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
        and c.relname not in ('households', 'household_members')
        and not exists (select 1 from pg_catalog.pg_trigger t
                          join pg_catalog.pg_proc f on f.oid = t.tgfoid
                          join pg_catalog.pg_namespace fn on fn.oid = f.pronamespace
                         where t.tgrelid = c.oid and not t.tgisinternal and t.tgenabled <> 'D'
                           and fn.nspname = 'private' and f.proname = 'handle_audit_fields'
                           and t.tgtype::int & 23 = 23) $$,
  'DB-S-14 every household-data table has the before insert-or-update audit trigger');

select is_empty(
  $$ select c.relname from pg_catalog.pg_class c
       join pg_catalog.pg_attribute a on a.attrelid = c.oid and a.attname = 'household_id' and not a.attisdropped
      where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
        and not exists (select 1 from pg_catalog.pg_index i
                         where i.indrelid = c.oid and i.indkey[0] = a.attnum and i.indpred is null) $$,
  'DB-S-15 every table with household_id has a full index that starts with household_id');

-- Materialized views can't be security_invoker and ignore RLS, so none are allowed.
select is_empty(
  $$ select c.relname from pg_catalog.pg_class c
      where c.relnamespace = 'public'::regnamespace
        and (c.relkind = 'm'
             or (c.relkind = 'v'
                 and not exists (select 1 from pg_catalog.pg_options_to_table(c.reloptions) o
                                  where o.option_name = 'security_invoker'
                                    and lower(o.option_value) in ('true', 'on', 'yes', '1')))) $$,
  'DB-S-12 every public view is security_invoker, and there are no materialized views');

-- Policies

select is_empty(
  $$ select p.schemaname, p.tablename, p.policyname from pg_catalog.pg_policies p
      where (p.schemaname = 'public' or (p.schemaname = 'realtime' and p.tablename = 'messages'))
        and exists (select 1 from unnest(p.roles) as r(role_name)
                     where case when r.role_name = 'public' then true
                                else pg_catalog.pg_has_role('anon', r.role_name, 'member') end) $$,
  'DB-S-03 no policy in public or on realtime.messages applies to anon or public');

select is_empty(
  $$ select p.schemaname, p.tablename, p.policyname from pg_catalog.pg_policies p
      where (p.schemaname = 'public' or (p.schemaname = 'realtime' and p.tablename = 'messages'))
        and (p.qual = 'true' or p.with_check = 'true') $$,
  'DB-S-04 no policy is unconditionally true');

-- Grants

select is_empty($$ select * from pg_temp.public_privileges('anon') $$,
  'DB-S-05 anon holds no privilege on any public table, view or column');

select set_eq(
  $$ select * from pg_temp.public_privileges('authenticated') $$,
  $$ select table_name, privilege from expected_authenticated_grants $$,
  'DB-S-06 authenticated holds exactly the design §4.4 grants');

-- Functions

select is_empty(
  $$ select p.oid::regprocedure::text from pg_catalog.pg_proc p where p.pronamespace = 'public'::regnamespace $$,
  'DB-S-11 public contains no functions, so there is no RPC surface');

-- CLAUDE.md requires `set search_path = ''`, which is stricter than any fixed path.
select is_empty(
  $$ select p.oid::regprocedure::text from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'private' and p.prosecdef
        and not coalesce(p.proconfig @> array['search_path=""'], false) $$,
  'DB-S-07 every security definer function in private has search_path set to empty');

select is_empty(
  $$ select p.oid::regprocedure::text from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'private' and pg_catalog.has_function_privilege('anon', p.oid, 'execute') $$,
  'DB-S-08 anon can execute no function in private');

select set_eq(
  $$ select p.proname::text from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'private' and pg_catalog.has_function_privilege('authenticated', p.oid, 'execute') $$,
  array['my_household_ids'],
  'DB-S-09 authenticated can execute only private.my_household_ids() in private');

select function_privs_are('private', 'provision_household', array['text', 'text', 'text[]', 'text[]'],
  'authenticated', array[]::text[],
  'DB-S-10 authenticated cannot execute private.provision_household');

-- Schemas

select schema_privs_are('private', 'anon', array[]::text[], 'DB-S-13 anon has no privilege on schema private');
select schema_privs_are('private', 'authenticated', array['USAGE'],
  'DB-S-13 authenticated has only USAGE on schema private');

select * from finish();
rollback;
