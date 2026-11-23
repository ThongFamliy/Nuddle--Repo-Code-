/* Nuddle+ — giao diện + dữ liệu.
   - Nếu files/config.js đã có url + anon key: dùng Supabase Auth và Postgres.
   - Nếu chưa: chạy chế độ demo, dữ liệu chỉ nằm trong bộ nhớ trình duyệt. */

const CONFIG = window.NUDDLE_CONFIG || {};
const BACKEND_READY =
  Boolean(CONFIG.url && CONFIG.key) &&
  !CONFIG.url.includes("YOUR-PROJECT") &&
  !CONFIG.key.includes("YOUR-ANON-KEY") &&
  typeof window.supabase !== "undefined";

const db = BACKEND_READY ? window.supabase.createClient(CONFIG.url, CONFIG.key) : null;

const MEDIA_BUCKET = "nuddle-media";

const FEED_SELECT =
  "id, body, community, created_at, author_id, image_url, " +
  "author:nuddle_profiles!nuddle_posts_author_id_fkey(display_name, avatar_color, avatar_url), " +
  "likes:nuddle_likes!nuddle_likes_post_id_fkey(user_id), " +
  "comments:nuddle_comments!nuddle_comments_post_id_fkey(id, body, created_at, " +
  "author:nuddle_profiles!nuddle_comments_author_id_fkey(display_name, avatar_color, avatar_url))";

const state = {
  me: null,
  posts: [],
  filter: "",
  authMode: "login",
  focusCommentPostId: null,
  pendingPhoto: null,
  pendingPhotoUrl: null,
  cameraMode: "post",
  cameraBlob: null,
  signupAvatar: null,
  signupAvatarUrl: null,
  view: "home",
  circles: [],
  people: [],
  posting: false
};

/* ------------------------------------------------------------ demo data */

const DEMO_POSTS = [
  {
    id: "demo-1",
    author: { name: "Phạm Minh", avatar: "av-a" },
    community: "Nuddle Dev",
    time: "6h",
    body: "Chia sẻ vài kênh mình hay theo dõi về Java, bytecode và frontend:\n#Acesse #Conhega #Curta #Compartilhe",
    likes: 1,
    liked: false,
    comments: []
  },
  {
    id: "demo-2",
    author: { name: "Rodrigue Dương", avatar: "av-b" },
    community: "Nuddle Beta cho Android",
    time: "11h",
    body: "Chào mọi người!\nMình gặp lỗi buộc dừng liên tục trên Nexus 7 bản 2013 trong 2 ngày qua…",
    likes: 4,
    liked: false,
    comments: [
      { author: { name: "Linh Trần", avatar: "av-c" }, text: "Bạn thử xoá cache ứng dụng rồi mở lại xem sao." }
    ]
  },
  {
    id: "demo-3",
    author: { name: "Linh Trần", avatar: "av-c" },
    community: "Nuddle Design",
    time: "1 ngày",
    body: "Bản thử nghiệm Nuddle+ đã có chế độ xem theo cộng đồng. Mọi người thấy bố cục thẻ bài viết thế nào?\n#NuddlePlus #UI",
    likes: 12,
    liked: false,
    comments: []
  },
  {
    id: "demo-4",
    author: { name: "Bảo Khang", avatar: "av-d" },
    community: "JVM & Bytecode",
    time: "2 ngày",
    body: "ASM sinh class động nhanh hơn hẳn so với viết tay từng adapter. Mình đang dùng nó để tạo lớp chuyển đổi dữ liệu ở backend Java.\n#Java #ASM",
    likes: 8,
    liked: true,
    comments: []
  }
];

/* ---------------------------------------------------------------- utils */

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));

const linkifyTags = (escaped) =>
  escaped.replace(/(^|[\s(])(#[\p{L}\p{N}_]+)/gu, (match, pre, tag) => `${pre}<a class="tag" href="#">${tag}</a>`);

const bodyToHtml = (body) =>
  String(body)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${linkifyTags(escapeHtml(line))}</p>`)
    .join("");

function relativeTime(iso) {
  const then = new Date(iso).getTime();
  if (!then) return "";
  const minutes = Math.floor(Math.max(0, Date.now() - then) / 60000);
  if (minutes < 1) return "Vừa xong";
  if (minutes < 60) return `${minutes} phút`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "1 ngày";
  if (days < 30) return `${days} ngày`;
  return new Date(then).toLocaleDateString("vi-VN");
}

const initialOf = (name) => (String(name || "?").trim().charAt(0) || "?").toUpperCase();

function avatarHtml(name, colorClass, url) {
  if (url) {
    return `<img class="avatar avatar-img" src="${escapeHtml(url)}" alt="${escapeHtml(initialOf(name))}">`;
  }
  return `<span class="avatar ${colorClass || "av-e"}">${escapeHtml(initialOf(name))}</span>`;
}

/* --------------------------------------------------------------- render */

const feedEl = document.getElementById("feed");
const emptyEl = document.getElementById("empty");
const bannerEl = document.getElementById("banner");
const composerInput = document.getElementById("composer-input");
const toastEl = document.getElementById("toast");
const meAvatarEl = document.getElementById("me-avatar");
const composerAvatarEl = document.getElementById("composer-avatar");
const accountMenuEl = document.getElementById("account-menu");
const accountEmailEl = document.getElementById("account-email");
const signoutBtn = document.getElementById("signout-btn");
const composerPhotoEl = document.getElementById("composer-photo");
const composerPhotoImg = document.getElementById("composer-photo-img");
const composerFootEl = document.getElementById("composer-foot");
const postSubmitBtn = document.getElementById("post-submit");

function renderComments(post) {
  if (!post.comments.length) return "";
  return `<ul class="comment-list">${post.comments.map((comment) => `
    <li class="comment">
      ${avatarHtml(comment.author.name, comment.author.avatar, comment.author.avatarUrl)}
      <div>
        <span class="comment-name">${escapeHtml(comment.author.name)}</span>
        <span class="comment-text">${escapeHtml(comment.text)}</span>
      </div>
    </li>`).join("")}</ul>`;
}

function renderPost(post) {
  return `
    <article class="card post" data-id="${post.id}">
      <header class="post-head">
        ${avatarHtml(post.author.name, post.author.avatar, post.author.avatarUrl)}
        <div class="post-line">
          <a class="author" href="#">${escapeHtml(post.author.name)}</a>
          <span class="sep">›</span>
          <a class="community" href="#">${escapeHtml(post.community)}</a>
        </div>
        <time class="post-time">${escapeHtml(post.time)}</time>
      </header>

      <div class="post-body">${bodyToHtml(post.body)}</div>
      ${post.image ? `<img class="post-image" src="${escapeHtml(post.image)}" alt="Ảnh trong bài viết" loading="lazy">` : ""}
      ${renderComments(post)}

      <div class="comment-box" hidden>
        <input class="comment-input" type="text" placeholder="Viết bình luận…" autocomplete="off">
      </div>

      <footer class="post-actions">
        <button class="plusone${post.liked ? " on" : ""}" data-action="like" aria-pressed="${post.liked}">
          <span class="plusone-mark">+1</span>
          <span class="plusone-count">${post.likes}</span>
        </button>
        <span class="spacer"></span>
        <button class="circle-btn" data-action="comment" aria-label="Bình luận">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8l-4 4z"/></svg>
        </button>
        <button class="circle-btn" data-action="share" aria-label="Chia sẻ">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M18 16a3 3 0 0 0-2.2 1l-6-3.3a3 3 0 0 0 0-1.4l6-3.3A3 3 0 1 0 15 6l-6 3.3a3 3 0 1 0 0 5.4l6 3.3A3 3 0 1 0 18 16z"/></svg>
        </button>
      </footer>
    </article>`;
}

function matchesFilter(post) {
  if (!state.filter) return true;
  return [post.author.name, post.community, post.body].join(" ").toLowerCase().includes(state.filter);
}

function render() {
  const visible = state.posts.filter(matchesFilter);
  feedEl.innerHTML = visible.map(renderPost).join("");
  emptyEl.hidden = visible.length > 0;
}

function findPostEl(id) {
  return feedEl.querySelector(`.post[data-id="${id}"]`);
}

function paintComments(postEl, post) {
  const list = postEl.querySelector(".comment-list");
  const html = renderComments(post);
  if (list) {
    if (html) list.outerHTML = html;
    else list.remove();
    return;
  }
  if (html) postEl.querySelector(".post-body").insertAdjacentHTML("afterend", html);
}

function paintLike(button, post) {
  button.classList.toggle("on", post.liked);
  button.setAttribute("aria-pressed", String(post.liked));
  button.querySelector(".plusone-count").textContent = post.likes;
}

let toastTimer;
function notify(message) {
  toastEl.textContent = message;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2800);
}

/* ---------------------------------------------------------------- feed */

async function refreshFeed() {
  if (!db) {
    render();
    return;
  }

  const { data, error } = await db
    .from("nuddle_posts")
    .select(FEED_SELECT)
    .order("created_at", { ascending: false })
    .limit(60);

  if (error) {
    console.error(error);
    notify("Không tải được bảng tin: " + error.message);
    return;
  }

  const myId = state.me && state.me.id;

  state.posts = (data || []).map((row) => {
    const likes = row.likes || [];
    const comments = (row.comments || [])
      .slice()
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    return {
      id: row.id,
      author: {
        name: (row.author && row.author.display_name) || "Người dùng Nuddle+",
        avatar: (row.author && row.author.avatar_color) || "av-e",
        avatarUrl: (row.author && row.author.avatar_url) || null
      },
      community: row.community || "Nuddle+",
      time: relativeTime(row.created_at),
      body: row.body,
      image: row.image_url || null,
      likes: likes.length,
      liked: likes.some((like) => like.user_id === myId),
      comments: comments.map((comment) => ({
        author: {
          name: (comment.author && comment.author.display_name) || "Người dùng Nuddle+",
          avatar: (comment.author && comment.author.avatar_color) || "av-e",
          avatarUrl: (comment.author && comment.author.avatar_url) || null
        },
        text: comment.body
      }))
    };
  });

  render();

  if (state.focusCommentPostId !== null) {
    const target = findPostEl(state.focusCommentPostId);
    if (target) {
      const box = target.querySelector(".comment-box");
      box.hidden = false;
      box.querySelector(".comment-input").focus();
    }
    state.focusCommentPostId = null;
  }
}

async function toggleLike(post, button) {
  const previous = { liked: post.liked, likes: post.likes };
  post.liked = !post.liked;
  post.likes = Math.max(0, post.likes + (post.liked ? 1 : -1));
  paintLike(button, post);

  if (!db) return;

  const result = post.liked
    ? await db.from("nuddle_likes").insert({ post_id: post.id, user_id: state.me.id })
    : await db.from("nuddle_likes").delete().match({ post_id: post.id, user_id: state.me.id });

  if (result.error) {
    post.liked = previous.liked;
    post.likes = previous.likes;
    paintLike(button, post);
    notify("Không lưu được +1: " + result.error.message);
  }
}

feedEl.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;

  const postEl = button.closest(".post");
  const post = state.posts.find((item) => String(item.id) === postEl.dataset.id);
  if (!post) return;

  if (button.dataset.action === "like") {
    toggleLike(post, button);
    return;
  }

  if (button.dataset.action === "comment") {
    const box = postEl.querySelector(".comment-box");
    box.hidden = !box.hidden;
    if (!box.hidden) box.querySelector(".comment-input").focus();
    return;
  }

  if (button.dataset.action === "share") {
    const url = `${location.href.split("#")[0]}#post-${post.id}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url)
        .then(() => notify("Đã sao chép liên kết bài viết"))
        .catch(() => notify(url));
    }
  }
});

feedEl.addEventListener("keydown", async (event) => {
  if (!event.target.classList.contains("comment-input") || event.key !== "Enter") return;

  const value = event.target.value.trim();
  if (!value) return;

  const postEl = event.target.closest(".post");
  const post = state.posts.find((item) => String(item.id) === postEl.dataset.id);
  if (!post) return;

  event.target.value = "";

  if (!db) {
    post.comments.push({
      author: { name: state.me.name, avatar: state.me.avatar },
      text: value
    });
    paintComments(postEl, post);
    return;
  }

  const { error } = await db
    .from("nuddle_comments")
    .insert({ post_id: post.id, author_id: state.me.id, body: value });

  if (error) {
    event.target.value = value;
    notify("Không gửi được bình luận: " + error.message);
    return;
  }

  state.focusCommentPostId = post.id;
  await refreshFeed();
});

composerInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  submitPost();
});

postSubmitBtn.addEventListener("click", () => submitPost());

/* ------------------------------------------------------------ circles */

const circlesView = document.getElementById("circles-view");
const circlesList = document.getElementById("circles-list");
const circlesEmpty = document.getElementById("circles-empty");
const circleForm = document.getElementById("circle-form");
const circleNameInput = document.getElementById("circle-name");
const composerCard = document.querySelector(".composer");

const CIRCLE_SELECT =
  "id, name, created_at, " +
  "members:nuddle_circle_members!nuddle_circle_members_circle_id_fkey(member_id, " +
  "member:nuddle_profiles!nuddle_circle_members_member_id_fkey(id, display_name, avatar_color, avatar_url))";

function showView(view) {
  state.view = view;
  const circles = view === "circles";
  circlesView.hidden = !circles;
  composerCard.hidden = circles;
  feedEl.hidden = circles;
  if (circles) {
    emptyEl.hidden = true;
    refreshCircles();
  } else {
    render();
  }
}

async function refreshCircles() {
  if (!db) {
    renderCircles();
    return;
  }

  const peoplePromise = db
    .from("nuddle_profiles")
    .select("id, display_name, avatar_color, avatar_url")
    .order("display_name", { ascending: true })
    .limit(200);

  const circlesPromise = db
    .from("nuddle_circles")
    .select(CIRCLE_SELECT)
    .order("created_at", { ascending: true });

  const [{ data: people, error: peopleError }, { data: rows, error }] = await Promise.all([
    peoplePromise,
    circlesPromise
  ]);

  if (error) {
    console.error(error);
    notify("Không tải được Circles: " + error.message);
    return;
  }
  if (peopleError) console.error(peopleError);

  const myId = state.me && state.me.id;
  state.people = (people || [])
    .filter((person) => person.id !== myId)
    .map((person) => ({
      id: person.id,
      name: person.display_name || "Người dùng Nuddle+",
      avatar: person.avatar_color || "av-e",
      avatarUrl: person.avatar_url || null
    }));

  state.circles = (rows || []).map((row) => ({
    id: row.id,
    name: row.name,
    members: (row.members || []).map((entry) => ({
      id: entry.member_id,
      name: (entry.member && entry.member.display_name) || "Người dùng Nuddle+",
      avatar: (entry.member && entry.member.avatar_color) || "av-e",
      avatarUrl: (entry.member && entry.member.avatar_url) || null
    }))
  }));

  renderCircles();
}

function renderCircle(circle) {
  const members = circle.members.length
    ? `<ul class="circle-members">${circle.members.map((member) => `
        <li class="circle-member">
          ${avatarHtml(member.name, member.avatar, member.avatarUrl)}
          <span class="circle-member-name">${escapeHtml(member.name)}</span>
          <button class="circle-member-remove" type="button" data-circle-action="remove" data-circle-id="${circle.id}" data-member-id="${member.id}" aria-label="Bỏ ${escapeHtml(member.name)} khỏi vòng">✕</button>
        </li>`).join("")}</ul>`
    : `<p class="circle-hint">Chưa có ai trong vòng này.</p>`;

  const joined = new Set(circle.members.map((member) => member.id));
  const options = state.people.filter((person) => !joined.has(person.id));
  const addRow = options.length
    ? `<div class="circle-add-row">
        <select class="circle-select" data-circle-id="${circle.id}" aria-label="Chọn người để thêm vào vòng">
          ${options.map((person) => `<option value="${person.id}">${escapeHtml(person.name)}</option>`).join("")}
        </select>
        <button class="circle-mini-btn" type="button" data-circle-action="add" data-circle-id="${circle.id}">Thêm</button>
      </div>`
    : `<p class="circle-hint">Chưa còn ai để thêm. Người khác đăng ký Nuddle+ sẽ hiện ở đây.</p>`;

  return `
    <article class="card circle-card">
      <header class="circle-card-head">
        <h3 class="circle-name">${escapeHtml(circle.name)}</h3>
        <span class="circle-count">${circle.members.length} người</span>
        <button class="circle-delete" type="button" data-circle-action="delete" data-circle-id="${circle.id}">Xoá vòng</button>
      </header>
      ${members}
      ${addRow}
    </article>`;
}

function renderCircles() {
  circlesList.innerHTML = state.circles.map(renderCircle).join("");
  circlesEmpty.hidden = state.circles.length > 0;
}

circleForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = circleNameInput.value.trim();
  if (!name) return;
  if (db && !state.me) {
    notify("Hãy đăng nhập trước nhé");
    return;
  }

  if (!db) {
    state.circles.push({ id: `local-${Date.now()}`, name, members: [] });
    circleNameInput.value = "";
    renderCircles();
    notify("Đã tạo vòng tròn (chế độ demo)");
    return;
  }

  const { error } = await db
    .from("nuddle_circles")
    .insert({ owner_id: state.me.id, name });

  if (error) {
    notify("Không tạo được vòng tròn: " + error.message);
    return;
  }

  circleNameInput.value = "";
  notify(`Đã tạo vòng tròn “${name}”`);
  await refreshCircles();
});

circlesList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-circle-action]");
  if (!button) return;

  const action = button.dataset.circleAction;
  const circleId = button.dataset.circleId;

  if (action === "delete") {
    if (!confirm("Xoá vòng tròn này? Mọi người trong vòng chỉ bị bỏ khỏi nhóm, tài khoản của họ không bị ảnh hưởng.")) return;

    if (!db) {
      state.circles = state.circles.filter((circle) => String(circle.id) !== circleId);
      renderCircles();
      return;
    }

    const { error } = await db.from("nuddle_circles").delete().eq("id", circleId);
    if (error) {
      notify("Không xoá được vòng: " + error.message);
      return;
    }
    notify("Đã xoá vòng tròn");
    await refreshCircles();
    return;
  }

  if (action === "remove") {
    const memberId = button.dataset.memberId;

    if (!db) {
      const circle = state.circles.find((item) => String(item.id) === circleId);
      if (circle) circle.members = circle.members.filter((member) => member.id !== memberId);
      renderCircles();
      return;
    }

    const { error } = await db
      .from("nuddle_circle_members")
      .delete()
      .match({ circle_id: circleId, member_id: memberId });

    if (error) {
      notify("Không bỏ được người khỏi vòng: " + error.message);
      return;
    }
    await refreshCircles();
    return;
  }

  if (action === "add") {
    const select = circlesList.querySelector(`.circle-select[data-circle-id="${circleId}"]`);
    const memberId = select && select.value;
    if (!memberId) return;

    if (!db) {
      const circle = state.circles.find((item) => String(item.id) === circleId);
      const person = state.people.find((item) => item.id === memberId);
      if (circle && person) circle.members.push(person);
      renderCircles();
      return;
    }

    const { error } = await db
      .from("nuddle_circle_members")
      .insert({ circle_id: circleId, member_id: memberId });

    if (error) {
      notify("Không thêm được người vào vòng: " + error.message);
      return;
    }
    await refreshCircles();
  }
});

/* ---------------------------------------------------------------- ảnh */

const cameraOverlay = document.getElementById("camera-overlay");
const cameraVideo = document.getElementById("camera-video");
const cameraCanvas = document.getElementById("camera-canvas");
const cameraPreview = document.getElementById("camera-preview");
const cameraNote = document.getElementById("camera-note");
const cameraTitle = document.getElementById("camera-title");
const cameraShot = document.getElementById("camera-shot");
const cameraRetake = document.getElementById("camera-retake");
const cameraUse = document.getElementById("camera-use");
const cameraFile = document.getElementById("camera-file");

let cameraStream = null;

function prepareImage(file, maxSize = 1600) {
  return new Promise((resolve, reject) => {
    if (!file.type || !file.type.startsWith("image/")) {
      reject(new Error("Tệp này không phải ảnh."));
      return;
    }
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(objectUrl);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Không xử lý được ảnh."))),
        "image/jpeg",
        0.88
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Không đọc được ảnh này."));
    };
    img.src = objectUrl;
  });
}

async function uploadImage(blob, kind) {
  if (!db) return URL.createObjectURL(blob);
  const path = `${state.me.id}/${kind}-${Date.now()}.jpg`;
  const { error } = await db.storage
    .from(MEDIA_BUCKET)
    .upload(path, blob, { contentType: "image/jpeg", upsert: false });
  if (error) throw error;
  const { data } = db.storage.from(MEDIA_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

function showPendingPhoto() {
  if (state.pendingPhoto && state.pendingPhotoUrl) {
    composerPhotoImg.src = state.pendingPhotoUrl;
    composerPhotoEl.hidden = false;
    composerFootEl.hidden = false;
  } else {
    composerPhotoEl.hidden = true;
    composerPhotoImg.removeAttribute("src");
    composerFootEl.hidden = true;
  }
}

function dropPendingPhoto() {
  if (state.pendingPhotoUrl) URL.revokeObjectURL(state.pendingPhotoUrl);
  state.pendingPhoto = null;
  state.pendingPhotoUrl = null;
  showPendingPhoto();
}

function clearComposer() {
  composerInput.value = "";
  dropPendingPhoto();
}

function setPostBusy(busy) {
  postSubmitBtn.disabled = busy;
  postSubmitBtn.textContent = busy ? "Đang đăng…" : "Đăng";
}

async function submitPost() {
  if (!state.me || state.posting) return;

  const value = composerInput.value.trim();
  const photo = state.pendingPhoto;
  if (!value && !photo) return;

  state.posting = true;
  setPostBusy(true);

  try {
    let imageUrl = null;
    if (photo) imageUrl = await uploadImage(photo, "post");

    if (!db) {
      state.posts.unshift({
        id: `local-${Date.now()}`,
        author: { name: state.me.name, avatar: state.me.avatar, avatarUrl: state.me.avatarUrl },
        community: "Nuddle+",
        time: "Vừa xong",
        body: value,
        image: imageUrl,
        likes: 0,
        liked: false,
        comments: []
      });
      clearComposer();
      render();
      notify("Đã đăng (chế độ demo, chỉ trong trình duyệt này)");
      return;
    }

    const { error } = await db.from("nuddle_posts").insert({
      author_id: state.me.id,
      body: value,
      community: "Nuddle+",
      image_url: imageUrl
    });
    if (error) throw error;

    clearComposer();
    notify(photo ? "Đã đăng bài kèm ảnh" : "Đã đăng bài");
    await refreshFeed();
  } catch (error) {
    notify("Không đăng được bài: " + error.message);
  } finally {
    state.posting = false;
    setPostBusy(false);
  }
}

function stopCameraStream() {
  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
  }
  cameraVideo.srcObject = null;
}

async function startCameraStream() {
  cameraNote.hidden = true;
  cameraVideo.hidden = false;
  cameraShot.hidden = false;

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    cameraVideo.hidden = true;
    cameraShot.hidden = true;
    cameraNote.hidden = false;
    cameraNote.textContent = "Trình duyệt này không mở được camera. Bạn bấm “Chọn ảnh từ máy” để dùng ảnh có sẵn nhé.";
    return;
  }

  try {
    stopCameraStream();
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false
    });
    cameraVideo.srcObject = cameraStream;
  } catch (error) {
    cameraVideo.hidden = true;
    cameraShot.hidden = true;
    cameraNote.hidden = false;
    cameraNote.textContent = "Không mở được camera (có thể bạn chưa cho phép trang dùng camera). Bạn vẫn có thể bấm “Chọn ảnh từ máy”.";
  }
}

function showCameraPreview(src) {
  if (cameraPreview.dataset.url) URL.revokeObjectURL(cameraPreview.dataset.url);
  cameraPreview.dataset.url = src;
  cameraPreview.src = src;
  cameraPreview.hidden = false;
  cameraVideo.hidden = true;
  cameraShot.hidden = true;
  cameraRetake.hidden = false;
  cameraUse.hidden = false;
  cameraNote.hidden = true;
  stopCameraStream();
}

function openCamera(mode) {
  if (!state.me && mode !== "signup") {
    notify("Hãy đăng nhập trước nhé");
    return;
  }
  state.cameraMode = mode;
  state.cameraBlob = null;
  cameraTitle.textContent =
    mode === "avatar" ? "Đổi ảnh đại diện"
      : mode === "signup" ? "Ảnh đại diện của bạn"
        : "Chụp ảnh cho bài đăng";
  cameraPreview.hidden = true;
  cameraPreview.removeAttribute("src");
  cameraRetake.hidden = true;
  cameraUse.hidden = true;
  cameraNote.hidden = true;
  cameraOverlay.hidden = false;
  startCameraStream();
}

function closeCamera() {
  stopCameraStream();
  cameraOverlay.hidden = true;
  cameraPreview.hidden = true;
  if (cameraPreview.dataset.url) {
    URL.revokeObjectURL(cameraPreview.dataset.url);
    delete cameraPreview.dataset.url;
  }
  state.cameraBlob = null;
}

cameraShot.addEventListener("click", () => {
  if (!cameraVideo.videoWidth) {
    notify("Camera chưa sẵn sàng, bạn đợi một chút rồi bấm lại nhé");
    return;
  }
  const scale = Math.min(1, 1600 / Math.max(cameraVideo.videoWidth, cameraVideo.videoHeight));
  cameraCanvas.width = Math.round(cameraVideo.videoWidth * scale);
  cameraCanvas.height = Math.round(cameraVideo.videoHeight * scale);
  cameraCanvas.getContext("2d").drawImage(cameraVideo, 0, 0, cameraCanvas.width, cameraCanvas.height);
  cameraCanvas.toBlob((blob) => {
    if (!blob) return;
    state.cameraBlob = blob;
    showCameraPreview(URL.createObjectURL(blob));
  }, "image/jpeg", 0.9);
});

cameraRetake.addEventListener("click", () => {
  cameraPreview.hidden = true;
  cameraRetake.hidden = true;
  cameraUse.hidden = true;
  state.cameraBlob = null;
  startCameraStream();
});

document.getElementById("camera-pick").addEventListener("click", () => {
  cameraFile.value = "";
  cameraFile.click();
});

cameraFile.addEventListener("change", async () => {
  const file = cameraFile.files && cameraFile.files[0];
  if (!file) return;
  try {
    const blob = await prepareImage(file);
    state.cameraBlob = blob;
    showCameraPreview(URL.createObjectURL(blob));
  } catch (error) {
    notify(error.message);
  }
});

cameraUse.addEventListener("click", async () => {
  const blob = state.cameraBlob;
  if (!blob) return;
  const mode = state.cameraMode;
  closeCamera();

  if (mode === "signup") {
    if (state.signupAvatarUrl) URL.revokeObjectURL(state.signupAvatarUrl);
    state.signupAvatar = blob;
    state.signupAvatarUrl = URL.createObjectURL(blob);
    authAvatarImg.src = state.signupAvatarUrl;
    authAvatarHint.textContent = "Đã chọn ảnh — bấm vào ảnh để đổi";
    notify("Đã chọn ảnh đại diện");
    return;
  }

  if (mode === "avatar") {
    try {
      notify("Đang tải ảnh đại diện…");
      const url = await uploadImage(blob, "avatar");
      if (db) {
        const { error } = await db
          .from("nuddle_profiles")
          .update({ avatar_url: url })
          .eq("id", state.me.id);
        if (error) throw error;
      }
      state.me.avatarUrl = url;
      updateMeUI();
      notify("Đã cập nhật ảnh đại diện");
      if (db) await refreshFeed();
    } catch (error) {
      notify("Không đổi được ảnh đại diện: " + error.message);
    }
    return;
  }

  dropPendingPhoto();
  state.pendingPhoto = blob;
  state.pendingPhotoUrl = URL.createObjectURL(blob);
  showPendingPhoto();
  notify("Đã thêm ảnh, bấm Đăng để hoàn tất");
});

document.getElementById("camera-close").addEventListener("click", closeCamera);

cameraOverlay.addEventListener("click", (event) => {
  if (event.target === cameraOverlay) closeCamera();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !cameraOverlay.hidden) closeCamera();
});

document.getElementById("photo-btn").addEventListener("click", () => openCamera("post"));
document.getElementById("composer-avatar-btn").addEventListener("click", () => openCamera("avatar"));
document.getElementById("avatar-btn").addEventListener("click", () => {
  closeAccountMenu();
  openCamera("avatar");
});
document.getElementById("composer-photo-remove").addEventListener("click", dropPendingPhoto);

/* ---------------------------------------------------------------- auth */

const authOverlay = document.getElementById("auth-overlay");
const authForm = document.getElementById("auth-form");
const authEmail = document.getElementById("auth-email");
const authPassword = document.getElementById("auth-password");
const authErrorEl = document.getElementById("auth-error");
const authSubmit = document.getElementById("auth-submit");
const authSwitch = document.getElementById("auth-switch");
const authSub = document.getElementById("auth-sub");
const authAvatarWrap = document.getElementById("auth-avatar-wrap");
const authAvatarBtn = document.getElementById("auth-avatar-btn");
const authAvatarImg = document.getElementById("auth-avatar-img");
const authAvatarHint = document.getElementById("auth-avatar-hint");
const AUTH_AVATAR_PLACEHOLDER = authAvatarImg.getAttribute("src");

function showAuthError(message) {
  authErrorEl.textContent = message;
  authErrorEl.hidden = false;
}

function clearAuthError() {
  authErrorEl.textContent = "";
  authErrorEl.hidden = true;
}

function setAuthBusy(busy) {
  authSubmit.disabled = busy;
  authSubmit.textContent = busy
    ? "Đang xử lý…"
    : state.authMode === "signup" ? "Tạo tài khoản" : "Đăng nhập";
}

function setAuthMode(mode) {
  state.authMode = mode;
  clearAuthError();
  const signup = mode === "signup";
  authSub.textContent = signup
    ? "Tạo tài khoản Nuddle+ bằng email"
    : "Đăng nhập để xem bảng tin của bạn";
  authSubmit.textContent = signup ? "Tạo tài khoản" : "Đăng nhập";
  authSwitch.textContent = signup
    ? "Đã có tài khoản? Đăng nhập"
    : "Chưa có tài khoản? Tạo mới";
  authPassword.autocomplete = signup ? "new-password" : "current-password";
  authAvatarWrap.hidden = !signup;
}

function resetSignupAvatar() {
  if (state.signupAvatarUrl) URL.revokeObjectURL(state.signupAvatarUrl);
  state.signupAvatar = null;
  state.signupAvatarUrl = null;
  authAvatarImg.src = AUTH_AVATAR_PLACEHOLDER;
  authAvatarHint.textContent = "Bấm để chụp hoặc chọn ảnh từ máy";
}

async function saveSignupAvatar() {
  const blob = state.signupAvatar;
  if (!blob || !state.me || !db) return;
  try {
    const url = await uploadImage(blob, "avatar");
    const { error } = await db
      .from("nuddle_profiles")
      .update({ avatar_url: url })
      .eq("id", state.me.id);
    if (error) throw error;
    state.me.avatarUrl = url;
    resetSignupAvatar();
    updateMeUI();
    await refreshFeed();
    notify("Đã lưu ảnh đại diện của bạn");
  } catch (error) {
    console.error(error);
    notify("Chưa lưu được ảnh đại diện: " + error.message);
  }
}

function translateAuthError(message) {
  const map = {
    "Invalid login credentials": "Email hoặc mật khẩu không đúng.",
    "Email not confirmed": "Email chưa được xác nhận. Hãy mở thư xác nhận, hoặc tắt mục Confirm email trong Supabase → Authentication → Sign In / Providers.",
    "User already registered": "Email này đã có tài khoản, hãy đăng nhập.",
    "Email rate limit exceeded": "Bạn thử quá nhiều lần, vui lòng đợi một lát."
  };
  return map[message] || message;
}

function updateMeUI() {
  const me = state.me;
  const name = me ? me.name : "Khách";
  const avatar = me ? me.avatar : "av-me";
  [meAvatarEl, composerAvatarEl].forEach((el) => {
    el.className = `avatar ${avatar}`;
    if (me && me.avatarUrl) {
      el.classList.add("avatar-img");
      el.style.backgroundImage = `url("${me.avatarUrl}")`;
      el.textContent = "";
    } else {
      el.style.backgroundImage = "";
      el.textContent = initialOf(name);
    }
  });
  accountEmailEl.textContent = me ? (me.email || me.name) : "Chưa đăng nhập";
  signoutBtn.hidden = !me || !db;
  document.getElementById("avatar-btn").hidden = !me;
}

function closeAccountMenu() {
  accountMenuEl.hidden = true;
}

async function applySession(session) {
  if (!session) {
    state.me = null;
    closeAccountMenu();
    updateMeUI();
    authOverlay.hidden = false;
    return;
  }

  state.me = {
    id: session.user.id,
    email: session.user.email,
    name: (session.user.email || "bạn").split("@")[0],
    avatar: "av-me",
    avatarUrl: null
  };

  const { data: profile } = await db
    .from("nuddle_profiles")
    .select("display_name, avatar_color, avatar_url")
    .eq("id", state.me.id)
    .maybeSingle();

  if (profile) {
    state.me.name = profile.display_name || state.me.name;
    state.me.avatar = profile.avatar_color || "av-me";
    state.me.avatarUrl = profile.avatar_url || null;
  } else {
    const colors = ["av-a", "av-b", "av-c", "av-d", "av-e"];
    const draft = {
      id: state.me.id,
      display_name: state.me.name,
      avatar_color: colors[Math.floor(Math.random() * colors.length)]
    };
    const { error: profileError } = await db.from("nuddle_profiles").insert(draft);
    if (profileError) {
      console.error(profileError);
    } else {
      state.me.name = draft.display_name;
      state.me.avatar = draft.avatar_color;
    }
  }

  authOverlay.hidden = true;
  updateMeUI();
  await refreshFeed();
  if (state.signupAvatar) await saveSignupAvatar();
}

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearAuthError();

  if (!db) {
    showAuthError("Chưa cấu hình Supabase: điền url và anon key vào files/config.js.");
    return;
  }

  const email = authEmail.value.trim();
  const password = authPassword.value;

  if (!email || !email.includes("@")) {
    showAuthError("Email chưa hợp lệ.");
    return;
  }
  if (password.length < 6) {
    showAuthError("Mật khẩu cần ít nhất 6 ký tự.");
    return;
  }

  setAuthBusy(true);

  if (state.authMode === "signup") {
    const { data, error } = await db.auth.signUp({ email, password });
    setAuthBusy(false);

    if (error) {
      showAuthError(translateAuthError(error.message));
      return;
    }
    if (!data.session) {
      showAuthError(
        state.signupAvatar
          ? "Đã tạo tài khoản. Mở email để xác nhận rồi đăng nhập lại — ảnh đại diện bạn chọn sẽ được lưu ngay sau khi đăng nhập (đừng tải lại trang trước đó nhé)."
          : "Đã tạo tài khoản. Mở email để xác nhận rồi đăng nhập lại (hoặc tắt Confirm email trong Supabase → Authentication → Sign In / Providers)."
      );
      setAuthMode("login");
      return;
    }
    await applySession(data.session);
    return;
  }

  const { data, error } = await db.auth.signInWithPassword({ email, password });
  setAuthBusy(false);

  if (error) {
    showAuthError(translateAuthError(error.message));
    return;
  }

  await applySession(data.session);
});

authSwitch.addEventListener("click", () => {
  setAuthMode(state.authMode === "login" ? "signup" : "login");
});

authAvatarBtn.addEventListener("click", () => openCamera("signup"));

signoutBtn.addEventListener("click", async () => {
  closeAccountMenu();
  if (!db) return;
  await db.auth.signOut();
  await applySession(null);
});

document.getElementById("account-btn").addEventListener("click", (event) => {
  event.stopPropagation();
  accountMenuEl.hidden = !accountMenuEl.hidden;
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".tb-account")) closeAccountMenu();
});

/* --------------------------------------------------------------- chrome */

document.getElementById("fab").addEventListener("click", () => {
  composerInput.focus();
  composerInput.scrollIntoView({ behavior: "smooth", block: "center" });
});

document.querySelectorAll(".nav-item").forEach((item) => {
  item.addEventListener("click", (event) => {
    event.preventDefault();
    document.querySelectorAll(".nav-item").forEach((other) => other.classList.remove("active"));
    item.classList.add("active");
    showView(item.dataset.nav === "circles" ? "circles" : "home");
    if (window.innerWidth <= 900) {
      document.querySelector(".sidebar").classList.remove("sidebar-open");
    }
  });
});

const searchbar = document.getElementById("searchbar");
const searchInput = document.getElementById("search-input");

document.getElementById("search-btn").addEventListener("click", () => {
  searchbar.hidden = !searchbar.hidden;
  if (!searchbar.hidden) {
    searchInput.focus();
  } else {
    searchInput.value = "";
    state.filter = "";
    render();
  }
});

searchInput.addEventListener("input", () => {
  state.filter = searchInput.value.trim().toLowerCase();
  render();
});

document.getElementById("menu-btn").addEventListener("click", () => {
  document.querySelector(".sidebar").classList.toggle("sidebar-open");
});

/* ---------------------------------------------------------------- boot */

async function boot() {
  if (!db) {
    bannerEl.hidden = false;
    state.me = { id: "demo", name: "Minh Anh", avatar: "av-me", email: "demo@nuddle.app" };
    state.posts = DEMO_POSTS.map((post) => ({ ...post }));
    updateMeUI();
    render();
    return;
  }

  const { data } = await db.auth.getSession();
  await applySession(data.session);

  db.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") applySession(null);
    if (event === "TOKEN_REFRESHED" && session && !state.me) applySession(session);
  });
}

boot();
