-- Entrega garantizada de la guía + atribución por canal + embudo
-- Ejecutar en Supabase (proyecto eyggurjcxfzhmotqusfn) → SQL Editor. Es idempotente.

-- 1) purchases: entrega, errores de envío, origen y seguimiento
alter table purchases
  add column if not exists access_token text default replace(gen_random_uuid()::text,'-',''),
  add column if not exists delivered_at timestamptz,
  add column if not exists delivery_claim_at timestamptz,
  add column if not exists email_error text,
  add column if not exists email_attempts int not null default 0,
  add column if not exists origin jsonb,
  add column if not exists origin_last jsonb,
  add column if not exists channel text,
  add column if not exists channel_last text,
  add column if not exists ga4_sent_at timestamptz,
  add column if not exists capi_sent_at timestamptz,
  add column if not exists tracking_error text,
  add column if not exists source text,
  add column if not exists recover_sent_at timestamptz;
update purchases set access_token = replace(gen_random_uuid()::text,'-','') where access_token is null;
create unique index if not exists purchases_access_token_key on purchases(access_token);

-- 2) leads: origen completo
alter table leads add column if not exists origin jsonb;

-- 3) contexto del pago (datos que no caben en la metadata de Stripe y no deben vivir allí)
create table if not exists checkout_context (
  payment_intent_id text primary key,
  email text,
  origin jsonb,
  origin_last jsonb,
  fbp text, fbc text,
  ga_client_id text, ga_session_id text,
  ip text, user_agent text, page_url text,
  respuestas jsonb, aid_ids text[], lead_token text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 4) eventos anónimos del embudo
create table if not exists events (
  id bigint generated always as identity primary key,
  created_at timestamptz default now(),
  visitor_id text,
  event text,
  channel text,
  utm_source text, utm_medium text, utm_campaign text, utm_content text,
  props jsonb
);
create index if not exists events_created_idx on events(created_at);

-- 5) chat de ventas gratis (sin datos personales)
create table if not exists sales_chat (
  id bigint generated always as identity primary key,
  created_at timestamptz default now(),
  visitor_id text,
  channel text,
  campaign text,
  user_msg text,
  bot_reply text
);

alter table checkout_context enable row level security;
alter table events enable row level security;
alter table sales_chat enable row level security;

-- 6) Vistas (solo accesibles con la clave de servicio / desde el panel de Supabase)
create or replace view funnel_daily with (security_invoker = on) as
with ev as (
  select (created_at at time zone 'Europe/Madrid')::date d,
         coalesce(channel,'directo') canal,
         coalesce(utm_campaign,'(sin campaña)') campana,
         event, visitor_id
  from events
), agg as (
  select d, canal, campana,
    count(distinct visitor_id) filter (where event='visit') visitas,
    count(distinct visitor_id) filter (where event='quiz_started') test_iniciado,
    count(distinct visitor_id) filter (where event='quiz_completed') test_completado,
    count(distinct visitor_id) filter (where event='quiz_results_shown') resultados_vistos,
    count(distinct visitor_id) filter (where event='open_pay_modal') modal_pago,
    count(distinct visitor_id) filter (where event='begin_checkout') pago_iniciado,
    count(distinct visitor_id) filter (where event='generate_lead') leads
  from ev group by 1,2,3
), pur as (
  select (created_at at time zone 'Europe/Madrid')::date d,
         coalesce(channel,'directo') canal,
         coalesce(origin->>'utm_campaign','(sin campaña)') campana,
         count(*) compras, sum(amount_cents)/100.0 ingresos_eur
  from purchases group by 1,2,3
)
select coalesce(a.d,p.d) fecha, coalesce(a.canal,p.canal) canal, coalesce(a.campana,p.campana) campana,
       coalesce(a.visitas,0) visitas, coalesce(a.test_iniciado,0) test_iniciado,
       coalesce(a.test_completado,0) test_completado, coalesce(a.resultados_vistos,0) resultados_vistos,
       coalesce(a.modal_pago,0) modal_pago, coalesce(a.pago_iniciado,0) pago_iniciado,
       coalesce(a.leads,0) leads, coalesce(p.compras,0) compras, coalesce(p.ingresos_eur,0) ingresos_eur
from agg a full join pur p on a.d=p.d and a.canal=p.canal and a.campana=p.campana
order by 1 desc, 2, 3;

create or replace view compras_a_revisar with (security_invoker = on) as
select id, payment_intent_id, created_at, email, delivered_at, email_attempts, email_error, channel, source
from purchases
where delivered_at is null or email is null or email_error is not null
order by created_at desc;

create or replace view chat_ventas_resumen with (security_invoker = on) as
select (created_at at time zone 'Europe/Madrid')::date fecha, channel, user_msg, bot_reply
from sales_chat order by created_at desc;

revoke all on funnel_daily, compras_a_revisar, chat_ventas_resumen from anon, authenticated;
