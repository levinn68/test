// /home/home.js
import { supabase } from "/assets/supabaseClient.js";
import { getSession, initGsiButton, onAuthChange, signOut } from "/assets/auth.js";

const $ = (q) => document.querySelector(q);

const ui = {
  feedList: $("#feedList"),
  emptyState: $("#emptyState"),
  refreshBtn: $("#refreshBtn"),

  annWrap: $("#annWrap"),
  newsCard: $("#newsCard"),
  newsTitle: $("#newsTitle"),
  newsBody: $("#newsBody"),
  pinCard: $("#pinCard"),
  pinBody: $("#pinBody"),

  avatarBtn: $("#avatarBtn"),
  menuBtn: $("#menuBtn"),
  menuSheet: $("#menuSheet"),
  loginSheet: $("#loginSheet"),
  composerSheet: $("#composerSheet"),
  threadSheet: $("#threadSheet"),

  btnLogin: $("#btnLogin"),
  btnLogout: $("#btnLogout"),

  menuAvatar: $("#menuAvatar"),
  menuName: $("#menuName"),
  menuSub: $("#menuSub"),

  composerBar: $("#composerBar"),
  composerSend: $("#composerSend"),
  composerAvatar: $("#composerAvatar"),
  composerHint: $("#composerHint"),

  sheetAvatar: $("#sheetAvatar"),
  sheetName: $("#sheetName"),
  composerInput: $("#composerInput"),
  charCounter: $("#charCounter"),
  btnPost: $("#btnPost"),
  postModeHint: $("#postModeHint"),

  btnAttach: $("#btnAttach"),
  fileInput: $("#fileInput"),
  mediaPreview: $("#mediaPreview"),
  mediaImg: $("#mediaImg"),
  mediaRemove: $("#mediaRemove"),

  gsiButton: $("#gsiButton"),
  gsiStatus: $("#gsiStatus"),

  threadHead: $("#threadHead"),
  threadList: $("#threadList"),
  btnReply: $("#btnReply"),

  toast: $("#toast"),
};

const state = {
  session: null,
  user: null,
  profile: null,
  feed: [],
  profilesById: new Map(),
  likedSet: new Set(),
  replyTarget: null,
  mediaFile: null,
};

function openSheet(el) {
  el.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}
function closeSheet(el) {
  el.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}
function toast(msg) {
  ui.toast.textContent = msg;
  ui.toast.classList.add("isOn");
  setTimeout(() => ui.toast.classList.remove("isOn"), 1600);
}

function getInitial(nameOrEmail = "U") {
  const c = (nameOrEmail.trim()[0] || "U").toUpperCase();
  return /[A-Z0-9]/.test(c) ? c : "U";
}

async function loadMyProfile() {
  if (!state.user) {
    state.profile = null;
    return;
  }
  const { data, error } = await supabase
    .from("profiles")
    .select("id,name,username,photo_url,points_total")
    .eq("id", state.user.id)
    .maybeSingle();

  if (!error) state.profile = data ?? null;
}

function renderAuthUI() {
  if (!state.user) {
    ui.avatarBtn.textContent = "U";
    ui.composerAvatar.textContent = "U";
    ui.composerHint.textContent = "Login dulu untuk posting...";
    ui.sheetAvatar.textContent = "U";
    ui.sheetName.textContent = "Guest";

    ui.menuAvatar.textContent = "U";
    ui.menuName.textContent = "Guest";
    ui.menuSub.textContent = "Belum login";

    ui.btnLogin.hidden = false;
    ui.btnLogout.hidden = true;
    return;
  }

  const displayName =
    state.profile?.username ||
    state.profile?.name ||
    state.user.email ||
    "User";

  const init = getInitial(displayName);

  ui.avatarBtn.textContent = init;
  ui.composerAvatar.textContent = init;
  ui.composerHint.textContent = "Ketik sesuatu...";
  ui.sheetAvatar.textContent = init;
  ui.sheetName.textContent = displayName;

  ui.menuAvatar.textContent = init;
  ui.menuName.textContent = state.profile?.name || displayName;
  ui.menuSub.textContent = state.profile?.username ? `@${state.profile.username}` : state.user.email;

  ui.btnLogin.hidden = true;
  ui.btnLogout.hidden = false;
}

async function claimLoginPointsSafe() {
  if (!state.user) return;
  try {
    await supabase.rpc("claim_login_points");
  } catch (_) {
    // kalau gagal karena belum authenticated, ya memang belum login
  }
}

async function loadAnnouncements() {
  // news
  const newsQ = supabase
    .from("announcements")
    .select("id,type,title,body,created_at")
    .eq("type", "news")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1);

  const pinQ = supabase
    .from("announcements")
    .select("id,type,title,body,created_at")
    .eq("type", "pin")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1);

  const [{ data: news }, { data: pin }] = await Promise.all([newsQ, pinQ]);

  let any = false;

  if (news?.[0]) {
    any = true;
    ui.newsCard.hidden = false;
    ui.newsTitle.textContent = news[0].title || "Info";
    ui.newsBody.textContent = news[0].body;
  } else {
    ui.newsCard.hidden = true;
  }

  if (pin?.[0]) {
    any = true;
    ui.pinCard.hidden = false;
    ui.pinBody.textContent = pin[0].body;
  } else {
    ui.pinCard.hidden = true;
  }

  ui.annWrap.hidden = !any;
}

async function loadFeed() {
  ui.feedList.innerHTML = `<div class="post"><div style="opacity:.7;font-weight:800">Loading...</div></div>`;
  ui.emptyState.hidden = true;

  // Top-level posts only
  const { data: posts, error } = await supabase
    .from("posts")
    .select("id,user_id,content,created_at,type,command_name,share_code,parent_id,is_deleted,post_media(storage_path,sort_order),post_likes(count)")
    .is("parent_id", null)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    ui.feedList.innerHTML = `<div class="post"><div style="opacity:.7">Gagal load feed: ${error.message}</div></div>`;
    return;
  }

  state.feed = posts ?? [];

  if (!state.feed.length) {
    ui.feedList.innerHTML = "";
    ui.emptyState.hidden = false;
    return;
  }

  // Collect user_ids
  const userIds = [...new Set(state.feed.map((p) => p.user_id))];

  // Fetch profiles for authors
  const { data: profs } = await supabase
    .from("profiles")
    .select("id,name,username,photo_url")
    .in("id", userIds);

  state.profilesById = new Map((profs ?? []).map((p) => [p.id, p]));

  // Fetch current user's likes on these posts (for like toggle UI)
  state.likedSet = new Set();
  if (state.user) {
    const postIds = state.feed.map((p) => p.id);
    const { data: likes } = await supabase
      .from("post_likes")
      .select("post_id")
      .eq("user_id", state.user.id)
      .in("post_id", postIds);

    (likes ?? []).forEach((l) => state.likedSet.add(l.post_id));
  }

  // Fetch reply counts in one go
  const postIds = state.feed.map((p) => p.id);
  const { data: replies } = await supabase
    .from("posts")
    .select("parent_id")
    .in("parent_id", postIds);

  const replyCount = new Map();
  (replies ?? []).forEach((r) => {
    replyCount.set(r.parent_id, (replyCount.get(r.parent_id) || 0) + 1);
  });

  renderFeed(replyCount);
}

function fmtTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (m) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[m]));
}

function renderFeed(replyCount = new Map()) {
  ui.feedList.innerHTML = "";

  for (const p of state.feed) {
    const author = state.profilesById.get(p.user_id);
    const name = author?.name || author?.username || "User";
    const uname = author?.username ? `@${author.username}` : "";
    const init = getInitial(author?.name || author?.username || "U");
    const isMine = state.user?.id === p.user_id;
    const isCmd = p.type === "command";
    const likeCount = p.post_likes?.[0]?.count ?? 0;
    const liked = state.likedSet.has(p.id);
    const replies = replyCount.get(p.id) || 0;

    const mediaSorted = (p.post_media ?? []).slice().sort((a,b)=> (a.sort_order||0)-(b.sort_order||0));
    const media0 = mediaSorted[0]?.storage_path;

    const el = document.createElement("article");
    el.className = "post";
    el.dataset.id = p.id;

    el.innerHTML = `
      <div class="post__top">
        <div class="post__who">
          <div class="post__avatar">${init}</div>
          <div class="post__meta">
            <div class="post__name">${escapeHtml(name)}</div>
            <div class="post__sub">
              <span>${escapeHtml(uname)}</span>
              ${isCmd ? `<span class="badgeCmd">/${escapeHtml(p.command_name || "cmd")}</span>` : ``}
              <span>•</span>
              <span>${fmtTime(p.created_at)}</span>
            </div>
          </div>
        </div>

        <button class="post__menu" type="button" aria-label="Aksi">${isMine ? "⋮" : "⤴"}</button>
      </div>

      <div class="post__content">${escapeHtml(p.content || "")}</div>

      ${media0 ? `<div class="post__media"><img loading="lazy" alt="media" data-media="${escapeHtml(media0)}"></div>` : ""}

      <div class="post__actions">
        <button class="actBtn actBtn--like ${liked ? "isOn" : ""}" type="button" data-act="like">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 21s-7-4.6-9.3-9A5.7 5.7 0 0 1 12 6.4a5.7 5.7 0 0 1 9.3 5.6C19 16.4 12 21 12 21Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
          </svg>
          <span>${likeCount}</span>
        </button>

        <button class="actBtn" type="button" data-act="reply">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
          </svg>
          <span>${replies}</span>
        </button>

        <button class="actBtn" type="button" data-act="copy">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M9 9h10v10H9V9Z" stroke="currentColor" stroke-width="1.8"/>
            <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          </svg>
          <span>Kode</span>
        </button>
      </div>
    `;

    // media public url
    if (media0) {
      const img = el.querySelector("img[data-media]");
      const path = img.getAttribute("data-media");
      const { data } = supabase.storage.from("posts").getPublicUrl(path);
      img.src = data.publicUrl;
      img.removeAttribute("data-media");
    }

    // actions
    el.addEventListener("click", async (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;

      const act = btn.dataset.act;

      if (btn.classList.contains("post__menu")) {
        if (isMine) {
          if (confirm("Hapus postingan ini? (Akan hilang buat semua orang)")) {
            const { error } = await supabase.from("posts").update({ is_deleted: true }).eq("id", p.id);
            if (error) return toast("Gagal hapus");
            toast("Dihapus");
            await loadFeed();
          }
        } else {
          toast("Nanti buat share/lihat detail 😄");
        }
        return;
      }

      if (act === "like") {
        if (!state.user) return openSheet(ui.loginSheet);

        if (state.likedSet.has(p.id)) {
          const { error } = await supabase
            .from("post_likes")
            .delete()
            .eq("post_id", p.id)
            .eq("user_id", state.user.id);
          if (error) return toast("Gagal unlike");
          state.likedSet.delete(p.id);
          toast("Unliked");
        } else {
          const { error } = await supabase
            .from("post_likes")
            .insert({ post_id: p.id, user_id: state.user.id });
          if (error) return toast("Gagal like");
          state.likedSet.add(p.id);
          toast("Liked");
        }
        await loadFeed();
      }

      if (act === "reply") {
        await openThread(p);
      }

      if (act === "copy") {
        const code = p.share_code || "";
        await navigator.clipboard.writeText(code);
        toast("Kode disalin");
      }
    });

    ui.feedList.appendChild(el);
  }
}

function updateComposerState() {
  const v = ui.composerInput.value.trim();
  ui.btnPost.disabled = v.length === 0;
  ui.charCounter.textContent = `${ui.composerInput.value.length}/280`;

  const isCmd = v.startsWith("/");
  ui.postModeHint.textContent = isCmd ? "Mode: Command" : "Mode: Post";
}

function resetComposer() {
  ui.composerInput.value = "";
  state.mediaFile = null;
  ui.mediaPreview.hidden = true;
  ui.mediaImg.src = "";
  updateComposerState();
}

async function createPost() {
  if (!state.user) {
    openSheet(ui.loginSheet);
    return;
  }

  const raw = ui.composerInput.value.trim();
  if (!raw) return;

  // command detection: "/poll ..." → type=command, command_name=poll
  let type = "post";
  let command_name = null;
  if (raw.startsWith("/")) {
    type = "command";
    command_name = raw.split(/\s+/)[0].slice(1).toLowerCase() || "cmd";
  }

  ui.btnPost.disabled = true;

  // Insert post
  const { data: inserted, error: insErr } = await supabase
    .from("posts")
    .insert({
      user_id: state.user.id,
      content: raw,
      type,
      command_name,
      parent_id: null,
    })
    .select("id")
    .single();

  if (insErr) {
    toast(`Gagal posting: ${insErr.message}`);
    ui.btnPost.disabled = false;
    return;
  }

  // Optional upload media
  if (state.mediaFile) {
    const file = state.mediaFile;
    const safeName = file.name.replace(/[^\w.\-]+/g, "_");
    const path = `${state.user.id}/${inserted.id}/${Date.now()}_${safeName}`;

    const { error: upErr } = await supabase.storage.from("posts").upload(path, file, {
      cacheControl: "3600",
      upsert: false,
    });

    if (!upErr) {
      await supabase.from("post_media").insert({
        post_id: inserted.id,
        storage_path: path,
        sort_order: 0,
      });
    } else {
      toast("Posting terkirim, tapi upload foto gagal");
    }
  }

  toast("Posting terkirim");
  closeSheet(ui.composerSheet);
  resetComposer();
  await loadFeed();
}

async function openThread(post) {
  state.replyTarget = post;

  // Head
  ui.threadHead.innerHTML = "";
  const head = document.createElement("div");
  head.className = "post";
  head.innerHTML = `<div style="font-weight:900">Thread</div><div style="opacity:.8;margin-top:8px;white-space:pre-wrap">${escapeHtml(post.content || "")}</div>`;
  ui.threadHead.appendChild(head);

  // Replies
  ui.threadList.innerHTML = `<div class="post"><div style="opacity:.7;font-weight:800">Loading replies...</div></div>`;

  const { data: replies, error } = await supabase
    .from("posts")
    .select("id,user_id,content,created_at")
    .eq("parent_id", post.id)
    .order("created_at", { ascending: true });

  if (error) {
    ui.threadList.innerHTML = `<div class="post"><div style="opacity:.7">Gagal load replies</div></div>`;
  } else {
    // Fetch reply authors profiles
    const ids = [...new Set((replies ?? []).map(r => r.user_id))];
    const { data: profs } = ids.length
      ? await supabase.from("profiles").select("id,name,username").in("id", ids)
      : { data: [] };

    const map = new Map((profs ?? []).map(p => [p.id, p]));

    ui.threadList.innerHTML = "";
    if (!(replies ?? []).length) {
      ui.threadList.innerHTML = `<div class="post"><div style="opacity:.7">Belum ada balasan</div></div>`;
    } else {
      for (const r of replies) {
        const a = map.get(r.user_id);
        const who = a?.username ? `@${a.username}` : (a?.name || "User");
        const item = document.createElement("div");
        item.className = "post";
        item.innerHTML = `
          <div style="display:flex;justify-content:space-between;gap:10px;">
            <div style="font-weight:900">${escapeHtml(who)}</div>
            <div style="opacity:.55;font-size:12px">${fmtTime(r.created_at)}</div>
          </div>
          <div style="margin-top:8px;white-space:pre-wrap">${escapeHtml(r.content || "")}</div>
        `;
        ui.threadList.appendChild(item);
      }
    }
  }

  openSheet(ui.threadSheet);
}

async function replyToThread() {
  if (!state.user) return openSheet(ui.loginSheet);
  if (!state.replyTarget) return;

  // Prefill composer dengan @user...
  const author = state.profilesById.get(state.replyTarget.user_id);
  const tag = author?.username ? `@${author.username} ` : "@user ";
  ui.composerInput.value = tag;
  updateComposerState();

  closeSheet(ui.threadSheet);
  openSheet(ui.composerSheet);

  // Mode reply: set parent_id saat posting
  ui.btnPost.onclick = async () => {
    const raw = ui.composerInput.value.trim();
    if (!raw) return;

    // enforce @ di awal
    const mustStart = tag.trim();
    const fixed = raw.startsWith(mustStart) ? raw : `${mustStart} ${raw}`;

    ui.btnPost.disabled = true;

    const { error } = await supabase.from("posts").insert({
      user_id: state.user.id,
      content: fixed,
      parent_id: state.replyTarget.id,
      type: "post",
    });

    if (error) {
      toast("Gagal reply");
      ui.btnPost.disabled = false;
      return;
    }

    toast("Reply terkirim");
    closeSheet(ui.composerSheet);
    resetComposer();
    ui.btnPost.onclick = createPost; // restore
    await loadFeed();
  };
}

function wireSheets() {
  document.addEventListener("click", (e) => {
    const t = e.target;
    if (t?.dataset?.close === "menu") closeSheet(ui.menuSheet);
    if (t?.dataset?.close === "login") closeSheet(ui.loginSheet);
    if (t?.dataset?.close === "composer") closeSheet(ui.composerSheet);
    if (t?.dataset?.close === "thread") closeSheet(ui.threadSheet);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    [ui.menuSheet, ui.loginSheet, ui.composerSheet, ui.threadSheet].forEach((s) => {
      if (s.getAttribute("aria-hidden") === "false") closeSheet(s);
    });
  });
}

async function init() {
  wireSheets();

  // Initial session
  state.session = await getSession();
  state.user = state.session?.user ?? null;
  await loadMyProfile();
  renderAuthUI();

  // Auth changes
  onAuthChange(async (session) => {
    state.session = session;
    state.user = session?.user ?? null;
    await loadMyProfile();
    renderAuthUI();

    if (state.user) {
      await claimLoginPointsSafe();
      toast("Login sukses");
      closeSheet(ui.loginSheet);
      closeSheet(ui.menuSheet);
    } else {
      toast("Logout");
    }

    await loadFeed();
  });

  // GSI button
  initGsiButton(ui.gsiButton, {
    onSuccess: async () => {
      ui.gsiStatus.textContent = "Login berhasil…";
    },
    onError: (e) => {
      ui.gsiStatus.textContent = `Gagal login: ${e.message}`;
    },
  });

  // Menu
  ui.menuBtn.addEventListener("click", () => openSheet(ui.menuSheet));
  ui.avatarBtn.addEventListener("click", () => openSheet(ui.menuSheet));

  ui.btnLogin.addEventListener("click", () => {
    closeSheet(ui.menuSheet);
    openSheet(ui.loginSheet);
  });

  ui.btnLogout.addEventListener("click", async () => {
    await signOut();
  });

  // Composer open
  ui.composerBar.addEventListener("click", (e) => {
    if (e.target.closest("#composerSend")) return;
    if (!state.user) return openSheet(ui.loginSheet);
    openSheet(ui.composerSheet);
    setTimeout(() => ui.composerInput.focus(), 60);
  });
  ui.composerSend.addEventListener("click", () => {
    if (!state.user) return openSheet(ui.loginSheet);
    openSheet(ui.composerSheet);
    setTimeout(() => ui.composerInput.focus(), 60);
  });

  // Attach media
  ui.btnAttach.addEventListener("click", () => ui.fileInput.click());
  ui.fileInput.addEventListener("change", () => {
    const f = ui.fileInput.files?.[0];
    if (!f) return;
    state.mediaFile = f;
    ui.mediaPreview.hidden = false;
    ui.mediaImg.src = URL.createObjectURL(f);
  });
  ui.mediaRemove.addEventListener("click", () => {
    state.mediaFile = null;
    ui.mediaPreview.hidden = true;
    ui.mediaImg.src = "";
    ui.fileInput.value = "";
  });

  // Post
  ui.btnPost.onclick = createPost;
  ui.composerInput.addEventListener("input", updateComposerState);
  updateComposerState();

  // Thread reply
  ui.btnReply.addEventListener("click", replyToThread);

  // Refresh
  ui.refreshBtn.addEventListener("click", async () => {
    await loadAnnouncements();
    await loadFeed();
    toast("Refresh");
  });

  // Load initial
  await loadAnnouncements();
  await loadFeed();

  if (state.user) await claimLoginPointsSafe();
}

init();