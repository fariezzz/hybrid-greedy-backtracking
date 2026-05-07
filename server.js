const fs = require("fs");
const http = require("http");
const path = require("path");

const host = "127.0.0.1";
const port = Number(process.env.PORT || 8000);
const root = __dirname;

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".png": "image/png",
};

function send(res, statusCode, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(statusCode, { "Content-Type": contentType });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const rawUrl = req.url ? req.url.split("?")[0] : "/";
  let requestPath = decodeURIComponent(rawUrl);

  if (requestPath === "/") {
    requestPath = "/web/";
  }

  let filePath = path.join(root, requestPath);
  if (!filePath.startsWith(root)) {
    send(res, 403, "Forbidden");
    return;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      send(res, 404, "Not found");
      return;
    }

    send(res, 200, data, contentTypes[path.extname(filePath)] || "application/octet-stream");
  });
});

server.listen(port, host, () => {
  console.log(`Web simulator: http://${host}:${port}/web/`);
});
