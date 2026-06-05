// ============================================================
// AC LIVERIES DB — supabase.js
// ============================================================

const SUPABASE_URL = 'https://edzjwdirlzxrrsksbxpc.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkemp3ZGlybHp4cnJza3NieHBjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2NjE1NzIsImV4cCI6MjA5NjIzNzU3Mn0.dY36WSOeZh3EXPLfDH11mmoAP6kYDPRW1AOnfRd0LBk';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// ============================================================
// FINGERPRINT (browser-based voting identity)
// ============================================================
async function getFingerprint() {
  const nav = window.navigator;
  const raw = [
    nav.userAgent, nav.language, nav.hardwareConcurrency,
    screen.width, screen.height, screen.colorDepth,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  ].join('|');
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('').slice(0,32);
}

function getVotedSet(type = 'livery') {
  const key = type === 'addon' ? 'acl_addon_votes' : 'acl_votes';
  try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')); } catch { return new Set(); }
}

function saveVotedSet(set, type = 'livery') {
  const key = type === 'addon' ? 'acl_addon_votes' : 'acl_votes';
  localStorage.setItem(key, JSON.stringify([...set]));
}

// ============================================================
// FETCH FUNCTIONS
// ============================================================

async function fetchCategories() {
  const { data } = await db.from('categories').select('*').order('name');
  return data || [];
}

async function fetchMods() {
  const { data } = await db.from('mods').select('*, categories(name, color_bg, color_text)').order('name');
  return data || [];
}

async function fetchChampionships() {
  const { data } = await db
    .from('championships')
    .select('*, championship_categories(category_id, categories(id, name, color_bg, color_text))')
    .order('name');
  if (!data) return [];
  return data.map(ch => ({
    ...ch,
    linked_categories: (ch.championship_categories || []).map(cc => cc.categories).filter(Boolean),
  }));
}

async function fetchArtists() {
  const { data } = await db.from('artists').select('*').order('name');
  return data || [];
}

async function fetchArtistStats() {
  const liveries = await db.from('liveries').select('artist_id, upvotes').eq('approved', true);
  const stats = {};
  (liveries.data || []).forEach(l => {
    if (!l.artist_id) return;
    if (!stats[l.artist_id]) stats[l.artist_id] = { count: 0, upvotes: 0 };
    stats[l.artist_id].count++;
    stats[l.artist_id].upvotes += l.upvotes || 0;
  });
  return stats;
}

async function fetchLiveries({
  categoryId, championshipId, modId, artistId,
  isPaid, confirmedOnly, communityOnly,
  search, sort = 'votes', page = 1, pageSize = 24,
  approvedOnly = true,
} = {}) {
  let q = db.from('liveries').select('*, mods(id,name), categories(id,name,color_bg,color_text), championships(id,name,short_name), artists(id,name,avatar_url)');
  if (approvedOnly) q = q.eq('approved', true);
  if (categoryId)     q = q.eq('category_id', categoryId);
  if (championshipId) q = q.eq('championship_id', championshipId);
  if (modId)          q = q.eq('mod_id', modId);
  if (artistId)       q = q.eq('artist_id', artistId);
  if (isPaid === true)  q = q.eq('is_paid', true);
  if (isPaid === false) q = q.eq('is_paid', false);
  if (confirmedOnly)  q = q.not('artist_id', 'is', null);
  if (communityOnly)  q = q.is('artist_id', null);
  if (search) {
    q = q.or(`name.ilike.%${search}%,team.ilike.%${search}%,driver.ilike.%${search}%,author.ilike.%${search}%,car_number.ilike.%${search}%`);
  }
  if (sort === 'votes')  q = q.order('upvotes', { ascending: false });
  if (sort === 'newest') q = q.order('created_at', { ascending: false });
  if (sort === 'name')   q = q.order('name', { ascending: true });
  const from = (page - 1) * pageSize;
  q = q.range(from, from + pageSize - 1);
  const { data } = await q;
  return data || [];
}

async function fetchLiveriesCount({
  categoryId, championshipId, modId, artistId,
  isPaid, confirmedOnly, communityOnly, search,
  approvedOnly = true,
} = {}) {
  let q = db.from('liveries').select('id', { count: 'exact', head: true });
  if (approvedOnly) q = q.eq('approved', true);
  if (categoryId)     q = q.eq('category_id', categoryId);
  if (championshipId) q = q.eq('championship_id', championshipId);
  if (modId)          q = q.eq('mod_id', modId);
  if (artistId)       q = q.eq('artist_id', artistId);
  if (isPaid === true)  q = q.eq('is_paid', true);
  if (isPaid === false) q = q.eq('is_paid', false);
  if (confirmedOnly)  q = q.not('artist_id', 'is', null);
  if (communityOnly)  q = q.is('artist_id', null);
  if (search) {
    q = q.or(`name.ilike.%${search}%,team.ilike.%${search}%,driver.ilike.%${search}%,author.ilike.%${search}%,car_number.ilike.%${search}%`);
  }
  const { count } = await q;
  return count || 0;
}

async function fetchLivery(id) {
  const { data } = await db.from('liveries')
    .select('*, mods(id,name), categories(id,name,color_bg,color_text), championships(id,name,short_name), artists(id,name,avatar_url,url_twitter,url_discord,url_patreon,url_youtube,url_overtake)')
    .eq('id', id).single();
  return data;
}

async function fetchAddons({ modId, categoryId, sort = 'votes', approvedOnly = true, search } = {}) {
  let q = db.from('addons').select('*, mods(id,name), categories(id,name,color_bg,color_text), artists(id,name)');
  if (approvedOnly) q = q.eq('approved', true);
  if (modId)       q = q.eq('mod_id', modId);
  if (categoryId)  q = q.eq('category_id', categoryId);
  if (search)      q = q.ilike('name', `%${search}%`);
  if (sort === 'votes')  q = q.order('upvotes', { ascending: false });
  if (sort === 'newest') q = q.order('created_at', { ascending: false });
  if (sort === 'name')   q = q.order('name', { ascending: true });
  const { data } = await q;
  return data || [];
}

async function fetchModDetail(id) {
  const { data } = await db.from('mods')
    .select('*, categories(id,name,color_bg,color_text)')
    .eq('id', id).single();
  return data;
}

async function fetchStats() {
  const [livCount, modCount, voteSum, topLiv] = await Promise.all([
    db.from('liveries').select('id', { count: 'exact', head: true }).eq('approved', true),
    db.from('mods').select('id', { count: 'exact', head: true }),
    db.from('liveries').select('upvotes').eq('approved', true),
    db.from('liveries').select('name').eq('approved', true).order('upvotes', { ascending: false }).limit(1),
  ]);
  const totalVotes = (voteSum.data || []).reduce((s, l) => s + (l.upvotes || 0), 0);
  return {
    total: livCount.count || 0,
    mods: modCount.count || 0,
    votes: totalVotes,
    top: topLiv.data?.[0]?.name || '—',
  };
}

async function fetchAdminStats() {
  const [total, pending, pendingAddons, votes, reports] = await Promise.all([
    db.from('liveries').select('id', { count: 'exact', head: true }).eq('approved', true),
    db.from('liveries').select('id', { count: 'exact', head: true }).eq('approved', false),
    db.from('addons').select('id', { count: 'exact', head: true }).eq('approved', false),
    db.from('liveries').select('upvotes').eq('approved', true),
    db.from('reports').select('id', { count: 'exact', head: true }).eq('resolved', false),
  ]);
  const totalVotes = (votes.data || []).reduce((s, l) => s + (l.upvotes || 0), 0);
  return {
    total: total.count || 0,
    pending: pending.count || 0,
    pendingAddons: pendingAddons.count || 0,
    totalVotes,
    openReports: reports.count || 0,
  };
}

async function fetchPendingLiveries() {
  const { data } = await db.from('liveries')
    .select('*, mods(id,name), categories(id,name,color_bg,color_text), championships(id,name), artists(id,name)')
    .eq('approved', false).order('created_at', { ascending: false });
  return data || [];
}

async function fetchPendingAddons() {
  const { data } = await db.from('addons')
    .select('*, mods(id,name), categories(id,name,color_bg,color_text), artists(id,name)')
    .eq('approved', false).order('created_at', { ascending: false });
  return data || [];
}

async function fetchReports() {
  const { data } = await db.from('reports')
    .select('*, liveries(id,name,download_url)')
    .eq('resolved', false).order('created_at', { ascending: false });
  return data || [];
}

async function fetchEditRequests() {
  const { data } = await db.from('livery_edit_requests')
    .select('*, liveries(id,name), artists(id,name)')
    .eq('status', 'pending').order('created_at', { ascending: false });
  return data || [];
}

async function fetchNewLiveriesCount(since) {
  const { count } = await db.from('liveries')
    .select('id', { count: 'exact', head: true })
    .eq('approved', true)
    .gt('created_at', new Date(since).toISOString());
  return count || 0;
}

// Token-based artist fetches
async function fetchArtistByToken(token) {
  const { data } = await db.from('artists').select('*').eq('edit_token', token).single();
  return data;
}

async function fetchLiveriesByToken(token) {
  const artist = await fetchArtistByToken(token);
  if (!artist) return [];
  const { data } = await db.from('liveries')
    .select('*, mods(id,name), categories(id,name,color_bg,color_text), championships(id,name)')
    .eq('artist_id', artist.id).eq('approved', true).order('created_at', { ascending: false });
  return data || [];
}

async function fetchAddonsByToken(token) {
  const artist = await fetchArtistByToken(token);
  if (!artist) return [];
  const { data } = await db.from('addons')
    .select('*, mods(id,name), categories(id,name,color_bg,color_text)')
    .eq('artist_id', artist.id).eq('approved', true).order('created_at', { ascending: false });
  return data || [];
}

// ============================================================
// MUTATIONS
// ============================================================

async function upvoteLivery(id) {
  const fp = await getFingerprint();
  const { data } = await db.rpc('upvote_livery', { p_livery_id: id, p_fingerprint: fp });
  if (data) { const s = getVotedSet(); s.add(id); saveVotedSet(s); }
  return !!data;
}

async function removeUpvoteLivery(id) {
  const fp = await getFingerprint();
  const { data } = await db.rpc('remove_upvote_livery', { p_livery_id: id, p_fingerprint: fp });
  if (data) { const s = getVotedSet(); s.delete(id); saveVotedSet(s); }
  return !!data;
}

async function upvoteAddon(id) {
  const fp = await getFingerprint();
  const { data } = await db.rpc('upvote_addon', { p_addon_id: id, p_fingerprint: fp });
  if (data) { const s = getVotedSet('addon'); s.add(id); saveVotedSet(s, 'addon'); }
  return !!data;
}

async function removeUpvoteAddon(id) {
  const fp = await getFingerprint();
  const { data } = await db.rpc('remove_upvote_addon', { p_addon_id: id, p_fingerprint: fp });
  if (data) { const s = getVotedSet('addon'); s.delete(id); saveVotedSet(s, 'addon'); }
  return !!data;
}

async function submitLivery(d) {
  const { data } = await db.rpc('submit_livery', {
    p_name: d.name, p_mod_id: d.mod_id || null, p_category_id: d.category_id || null,
    p_championship_id: d.championship_id || null, p_team: d.team || null,
    p_driver: d.driver || null, p_season: d.season || null, p_car_number: d.car_number || null,
    p_author: d.author || null, p_artist_id: d.artist_id || null,
    p_download_url: d.download_url || null, p_image_url: d.image_url || null,
    p_notes: d.notes || null, p_is_paid: d.is_paid || false,
  });
  return !!data;
}

async function submitAddon(d) {
  const { data } = await db.rpc('submit_addon', {
    p_name: d.name, p_mod_id: d.mod_id || null, p_category_id: d.category_id || null,
    p_artist_id: d.artist_id || null, p_addon_type: d.addon_type || null,
    p_author: d.author || null, p_download_url: d.download_url || null,
    p_image_url: d.image_url || null, p_notes: d.notes || null, p_is_paid: d.is_paid || false,
  });
  return !!data;
}

async function reportLivery(id, reason, notes) {
  const { data } = await db.rpc('submit_report', { p_livery_id: id, p_reason: reason, p_notes: notes || null });
  return !!data;
}

// Admin mutations
async function approveLivery(id) {
  await db.rpc('approve_livery', { p_id: id }); return true;
}
async function rejectLivery(id) {
  await db.rpc('reject_livery', { p_id: id }); return true;
}
async function approveAddon(id) {
  await db.rpc('approve_addon', { p_id: id }); return true;
}
async function deleteAddon(id) {
  await db.rpc('delete_addon', { p_id: id }); return true;
}
async function updateLivery(id, data) {
  await db.rpc('admin_update_livery', { p_id: id, p_data: data }); return true;
}
async function updateAddon(id, data) {
  await db.rpc('admin_update_addon', { p_id: id, p_data: data }); return true;
}
async function deleteLivery(id) {
  await db.rpc('admin_delete_livery', { p_id: id }); return true;
}
async function createArtist(data) {
  const { data: d } = await db.rpc('admin_create_artist', { p_data: data }); return !!d;
}
async function updateArtist(id, data) {
  await db.rpc('admin_update_artist', { p_id: id, p_data: data }); return true;
}
async function deleteArtist(id) {
  await db.rpc('admin_delete_artist', { p_id: id }); return true;
}
async function generateArtistToken(artistId) {
  const { data } = await db.rpc('generate_artist_token', { p_artist_id: artistId }); return data;
}
async function resolveReport(id) {
  await db.rpc('admin_resolve_report', { p_id: id }); return true;
}
async function approveEditRequest(reqId, liveryId, field, value) {
  await db.rpc('admin_approve_edit_request', { p_request_id: reqId, p_livery_id: liveryId, p_field: field, p_value: value }); return true;
}
async function rejectEditRequest(id) {
  await db.rpc('admin_reject_edit_request', { p_request_id: id }); return true;
}
async function createChampionship(data, categoryIds) {
  const { data: d } = await db.rpc('admin_create_championship', { p_data: data, p_category_ids: categoryIds }); return !!d;
}
async function updateChampionship(id, data, categoryIds) {
  await db.rpc('admin_update_championship', { p_id: id, p_data: data, p_category_ids: categoryIds }); return true;
}
async function deleteChampionship(id) {
  await db.rpc('admin_delete_championship', { p_id: id }); return true;
}
async function createMod(data) {
  const { data: d } = await db.rpc('admin_create_mod', { p_data: data }); return !!d;
}
async function updateMod(id, data) {
  await db.rpc('admin_update_mod', { p_id: id, p_data: data }); return true;
}
async function deleteMod(id) {
  await db.rpc('admin_delete_mod', { p_id: id }); return true;
}
async function createCategory(data) {
  const { data: d } = await db.rpc('admin_create_category', { p_name: data.name, p_color_bg: data.color_bg, p_color_text: data.color_text }); return !!d;
}
async function updateCategory(id, data) {
  await db.rpc('admin_update_category', { p_id: id, p_name: data.name, p_color_bg: data.color_bg, p_color_text: data.color_text }); return true;
}
async function deleteCategory(id) {
  await db.rpc('admin_delete_category', { p_id: id }); return true;
}

// Artist token-based mutations
async function updateLiveryAsArtist(token, id, data) {
  const { data: d } = await db.rpc('artist_update_livery', { p_token: token, p_livery_id: id, p_data: data }); return !!d;
}
async function updateAddonAsArtist(token, id, data) {
  const { data: d } = await db.rpc('artist_update_addon', { p_token: token, p_addon_id: id, p_data: data }); return !!d;
}
async function submitLiveryAsArtist(token, data) {
  const { data: d } = await db.rpc('artist_submit_livery', { p_token: token, p_data: data }); return !!d;
}
async function submitAddonAsArtist(token, data) {
  const { data: d } = await db.rpc('artist_submit_addon', { p_token: token, p_data: data }); return !!d;
}
async function updateArtistProfile(token, data) {
  const { data: d } = await db.rpc('artist_update_profile', { p_token: token, p_data: data }); return !!d;
}
async function submitEditRequest(token, liveryId, changes) {
  for (const [field, vals] of Object.entries(changes)) {
    await db.rpc('artist_submit_edit_request', {
      p_token: token, p_livery_id: liveryId,
      p_field: field, p_old_value: String(vals.old || ''), p_new_value: String(vals.new || ''),
    });
  }
  return true;
}
