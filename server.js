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

app.listen(PORT, "0.0.0.0", () => {
  console.log("✅ Server listening on", PORT);
  console.log("✅ Upload dir:", UPLOAD_DIR);
});
