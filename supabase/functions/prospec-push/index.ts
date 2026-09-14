// prospec-push — emissor Web Push da Prospeção (disparado por pg_cron, 15m).
// Para cada dispositivo subscrito envia um resumo das tarefas por-hoje / em
// atraso do respetivo âmbito (admin vê todas; vendedor só as suas) e avisa os
// admins de novos clientes lançados por outros. Dedup por (dia, referência,
// destinatário) em prospec_push_sent. VAPID reutilizado de cs_config.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

const TZ = 'Europe/Lisbon';
// Minutos a somar ao UTC para obter a hora local de Lisboa no instante `at`.
function tzOffsetMinutes(at: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = Object.fromEntries(dtf.formatToParts(at).map((x) => [x.type, x.value])) as Record<string, string>;
  const asLocal = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((asLocal - at.getTime()) / 60000);
}
function lisbonDay(at: Date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(at).map((x) => [x.type, x.value])) as Record<string, string>;
  const off = tzOffsetMinutes(at);
  const endOfDayUTC = new Date(Date.UTC(+p.year, +p.month - 1, +p.day, 23, 59, 59, 999) - off * 60000);
  return { dayKey: `${p.year}-${p.month}-${p.day}`, endOfDayUTC };
}
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', timeZone: TZ });

interface TaskRow { id: string; descricao: string; due_at: string; owner_email: string | null; }
interface SubRow { endpoint: string; p256dh: string; auth: string; user_email: string | null; fail_count: number | null; }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const supa = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const body = await req.json().catch(() => ({}));

    const { data: cfg } = await supa.from('cs_config').select('vapid_public, vapid_private, vapid_subject').eq('id', 1).single();
    if (!cfg?.vapid_public || !cfg?.vapid_private) return json({ error: 'cs_config sem chaves VAPID' }, 400);
    webpush.setVapidDetails(cfg.vapid_subject || 'mailto:alerts@baviera.local', cfg.vapid_public, cfg.vapid_private);

    // Envia um payload a um conjunto de subscrições, com limpeza de endpoints mortos.
    const sendTo = async (subs: SubRow[], payload: Record<string, unknown>) => {
      let sent = 0, pruned = 0;
      for (const s of subs) {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            JSON.stringify(payload),
          );
          sent++;
          await supa.from('prospec_push_subs').update({ last_ok: new Date().toISOString(), fail_count: 0 }).eq('endpoint', s.endpoint);
        } catch (e) {
          const code = (e as { statusCode?: number })?.statusCode;
          if (code === 404 || code === 410) { await supa.from('prospec_push_subs').delete().eq('endpoint', s.endpoint); pruned++; }
          else { await supa.from('prospec_push_subs').update({ fail_count: (s.fail_count || 0) + 1 }).eq('endpoint', s.endpoint); }
        }
      }
      return { sent, pruned };
    };

    const { data: allSubs } = await supa.from('prospec_push_subs').select('*');
    const subs = (allSubs || []) as SubRow[];
    if (subs.length === 0) return json({ subs: 0, note: 'sem dispositivos subscritos' });

    // Modo de teste: dispara um aviso imediato a todos (botão "Ativar").
    if (body?.test) {
      const res = await sendTo(subs, { title: '🔔 Notificações ativas', body: 'Vais receber aqui as tarefas para hoje e em atraso da Prospeção.', data: { url: '/prospecao' } });
      return json({ test: true, ...res });
    }

    const now = new Date();
    const { dayKey, endOfDayUTC } = lisbonDay(now);

    // Limpeza do registo de dedup (mantém hoje e o sentinela de contas 'acct').
    await supa.from('prospec_push_sent').delete().neq('day_key', 'acct').lt('day_key', dayKey);

    // ── Quem é admin (vê todas as tarefas) ──
    const { data: adminRoles } = await supa.from('app_roles').select('name').eq('is_admin', true);
    const adminNames = new Set((adminRoles || []).map((r: { name: string }) => r.name));
    const { data: users } = await supa.from('app_users').select('email, perfil');
    const adminEmails = new Set(
      (users || []).filter((u: { perfil: string | null }) => u.perfil && adminNames.has(u.perfil))
        .map((u: { email: string | null }) => (u.email || '').toLowerCase()).filter(Boolean),
    );

    // ── Tarefas por-hoje / em atraso ──
    const { data: taskData } = await supa.from('prospec_tasks')
      .select('id, descricao, due_at, owner_email')
      .eq('done', false).not('due_at', 'is', null)
      .lte('due_at', endOfDayUTC.toISOString())
      .order('due_at', { ascending: true });
    const tasks = (taskData || []) as TaskRow[];

    // ── Novos clientes (para admins) ──
    const acctSince = new Date(now.getTime() - 24 * 3600e3).toISOString();
    const { data: acctData } = await supa.from('prospec_accounts')
      .select('id, nome, owner_nome, created_by, created_at')
      .gte('created_at', acctSince).order('created_at', { ascending: false });
    const accounts = (acctData || []) as Array<{ id: string; nome: string; owner_nome: string | null; created_by: string | null; created_at: string }>;

    // Subscrições agrupadas por destinatário.
    const byEmail = new Map<string, SubRow[]>();
    for (const s of subs) {
      const key = (s.user_email || '').toLowerCase();
      if (!byEmail.has(key)) byEmail.set(key, []);
      byEmail.get(key)!.push(s);
    }

    // Já enviados hoje (dedup).
    const { data: sentRows } = await supa.from('prospec_push_sent').select('ref, user_email').or(`day_key.eq.${dayKey},day_key.eq.acct`);
    const alreadySent = new Set((sentRows || []).map((r: { ref: string; user_email: string }) => `${r.user_email}::${r.ref}`));

    const sentInserts: Array<{ day_key: string; ref: string; user_email: string }> = [];
    let totalSent = 0, totalPruned = 0, recipients = 0;

    for (const [email, group] of byEmail.entries()) {
      const isAdmin = adminEmails.has(email);
      // Tarefas do âmbito deste destinatário.
      const mine = isAdmin ? tasks : tasks.filter((t) => (t.owner_email || '').toLowerCase() === email);
      const freshTasks = mine.filter((t) => !alreadySent.has(`${email}::task:${t.id}`));
      // Novos clientes: só admins, e nunca das suas próprias contas.
      const freshAccts = isAdmin
        ? accounts.filter((a) => (a.created_by || '').toLowerCase() !== email && !alreadySent.has(`${email}::acct:${a.id}`))
        : [];

      if (freshTasks.length === 0 && freshAccts.length === 0) continue;

      const overdue = freshTasks.filter((t) => new Date(t.due_at).getTime() < now.getTime());
      const today = freshTasks.filter((t) => new Date(t.due_at).getTime() >= now.getTime());

      // Constrói título/corpo.
      let title: string;
      const lines: string[] = [];
      if (freshTasks.length > 0) {
        const parts: string[] = [];
        if (today.length) parts.push(`${today.length} para hoje`);
        if (overdue.length) parts.push(`${overdue.length} em atraso`);
        title = `✅ Tarefas — ${parts.join(' · ')}`;
        for (const t of [...overdue, ...today].slice(0, 4)) {
          const late = new Date(t.due_at).getTime() < now.getTime();
          lines.push(`• ${t.descricao} (${late ? `${fmtDate(t.due_at)} ${fmtTime(t.due_at)}` : fmtTime(t.due_at)})`);
        }
        const extra = freshTasks.length - Math.min(4, freshTasks.length);
        if (extra > 0) lines.push(`+${extra} outra(s)`);
        if (freshAccts.length) lines.push(`👤 ${freshAccts.length} novo(s) cliente(s)`);
      } else {
        title = freshAccts.length === 1
          ? `👤 Novo cliente: ${freshAccts[0].nome}`
          : `👤 ${freshAccts.length} novos clientes`;
        for (const a of freshAccts.slice(0, 4)) lines.push(`• ${a.nome}${a.owner_nome ? ` (${a.owner_nome})` : ''}`);
      }

      const res = await sendTo(group, { title, body: lines.join('\n'), data: { url: '/prospecao' } });
      totalSent += res.sent; totalPruned += res.pruned; recipients++;

      // Só marca como enviado se algum dispositivo aceitou (evita perder o aviso).
      if (res.sent > 0) {
        for (const t of freshTasks) sentInserts.push({ day_key: dayKey, ref: `task:${t.id}`, user_email: email });
        for (const a of freshAccts) sentInserts.push({ day_key: 'acct', ref: `acct:${a.id}`, user_email: email });
      }
    }

    if (sentInserts.length) await supa.from('prospec_push_sent').upsert(sentInserts, { onConflict: 'day_key,ref,user_email', ignoreDuplicates: true });

    return json({ subs: subs.length, recipients, sent: totalSent, pruned: totalPruned, tasks: tasks.length });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 400);
  }
});
