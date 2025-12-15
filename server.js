import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// 上传目录（本地 / Railway 都能用）
const UPLOAD_DIR =
  process.env.UPLOAD_DIR || path.join(__dirname, "uploads");

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ========= 上传状态 =========
let status = {
  state: "idle", // idle | uploading | done | error
  filename: null,
  bytesReceived: 0,
  bytesTotal: 0,
  percent: 0,
  message: ""
};

// 统计上传进度
app.use((req, res, next) => {
  if (req.method === "POST" && req.path === "/upload") {
    status.state = "uploading";
    status.filename = null;
    status.bytesReceived = 0;
    status.bytesTotal = Number(req.headers["content-length"] || 0);
    status.percent = 0;
    status.message = "";

    req.on("data", (chunk) => {
      status.bytesReceived += chunk.length;
      if (status.bytesTotal > 0) {
        status.percent = Math.min(
          100,
          Math.round((status.bytesReceived / status.bytesTotal) * 100)
        );
      }
    });

    req.on("error", (e) => {
      status.state = "error";
      status.message = String(e);
    });
  }
  next();
});

// ========= 上传 =========
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, file.originalname),
});
const upload = multer({ storage });

app.post("/upload", upload.single("file1"), (req, res) => {
  try {
    status.filename = req.file?.originalname || null;
    status.state = "done";
    status.percent = 100;
    res.json({ ok: true, filename: status.filename });
  } catch (e) {
    status.state = "error";
    status.message = String(e);
    res.status(500).json({ ok: false });
  }
});

// ========= 状态 =========
app.get("/status", (req, res) => res.json(status));

// 文件列表
app.get("/files", (req, res) => {
  const files = fs
    .readdirSync(UPLOAD_DIR)
    .filter((f) => f.toLowerCase().endsWith(".mp4"));
  res.json({ files });
});

// 静态网页
app.use(express.static(path.join(__dirname, "public")));

// ====== 视频浏览：API + 静态播放 ======
import fs from "fs";
import path from "path";
import express from "express";

// 你的 UPLOAD_DIR 如果原来就有，就别重复定义。
// 这里为了兼容：没有就默认 /app/uploads
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");

// 让浏览器可以直接访问 mp4：/media/xxx.mp4
app.use("/media", express.static(UPLOAD_DIR, {
  setHeaders: (res) => {
    // 允许浏览器播放
    res.setHeader("Accept-Ranges", "bytes");
  }
}));

function parseFilename(name) {
  // 期望：user_style_skill_take.mp4
  // 例：GRC_middle_10_1.mp4
  const base = name.replace(/\.[^/.]+$/, "");
  const parts = base.split("_");
  if (parts.length < 4) return null;
  const [user, style, skill, take] = parts;
  return { user, style, skill, take };
}

function listVideos() {
  if (!fs.existsSync(UPLOAD_DIR)) return [];
  const files = fs.readdirSync(UPLOAD_DIR)
    .filter(f => f.toLowerCase().endsWith(".mp4"));

  const items = files.map((filename) => {
    const fp = path.join(UPLOAD_DIR, filename);
    const st = fs.statSync(fp);
    const meta = parseFilename(filename);

    return {
      filename,
      url: `/media/${encodeURIComponent(filename)}`,
      size: st.size,
      mtime: st.mtimeMs,
      ...(meta || { user: "unknown", style: "", skill: "", take: "" })
    };
  });

  // 最新的在前
  items.sort((a, b) => b.mtime - a.mtime);
  return items;
}

// 全部视频
app.get("/api/files", (req, res) => {
  res.json({ ok: true, uploadDir: UPLOAD_DIR, files: listVideos() });
});

// 所有用户
app.get("/api/users", (req, res) => {
  const files = listVideos();
  const users = Array.from(new Set(files.map(x => x.user))).sort();
  res.json({ ok: true, users });
});

// 某个用户的全部视频
app.get("/api/user/:name", (req, res) => {
  const name = (req.params.name || "").trim();
  const files = listVideos().filter(x => x.user === name);
  res.json({ ok: true, user: name, files });
});


app.listen(PORT, "0.0.0.0", () => {
  console.log("✅ Server listening on", PORT);
  console.log("✅ Upload dir:", UPLOAD_DIR);
});
