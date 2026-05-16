const crypto = require("crypto");
const http = require("http");

const PORT = Number(process.env.PORT || 4174);
const SECRET = process.env.MINI_SUDOKU_SECRET || "dev-only-change-this-mini-sudoku-secret";
const ALLOWED_ORIGIN = process.env.PUBLIC_ORIGIN || "*";

function sendJson(req, res, status, body) {
  const payload = JSON.stringify(body);
  const origin = ALLOWED_ORIGIN === "*" ? req.headers.origin || "*" : ALLOWED_ORIGIN;
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
    "vary": "Origin",
    "content-length": Buffer.byteLength(payload)
  });
  res.end(payload);
}

function handleOptions(req, res) {
  const origin = ALLOWED_ORIGIN === "*" ? req.headers.origin || "*" : ALLOWED_ORIGIN;
  res.writeHead(204, {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
    "vary": "Origin"
  });
  res.end();
}

function getHourKey(date = new Date()) {
  return date.toISOString().slice(0, 13);
}

function getExpiry(hourKey) {
  return new Date(`${hourKey}:00:00.000Z`).getTime() + 60 * 60 * 1000;
}

function hmac(label, hourKey) {
  return crypto.createHmac("sha256", SECRET).update(`${label}:${hourKey}`).digest();
}

function makeRng(seedBuffer) {
  let counter = 0;
  let pool = Buffer.alloc(0);
  return function next(max) {
    if (max <= 0) return 0;
    while (pool.length < 4) {
      const block = crypto
        .createHash("sha256")
        .update(seedBuffer)
        .update(Buffer.from(String(counter++)))
        .digest();
      pool = Buffer.concat([pool, block]);
    }
    const value = pool.readUInt32BE(0);
    pool = pool.subarray(4);
    return value % max;
  };
}

function shuffle(values, rng) {
  const copy = values.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = rng(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function buildSolution(hourKey) {
  const rng = makeRng(hmac("solution", hourKey));
  const base = [
    [1, 2, 3, 4],
    [3, 4, 1, 2],
    [2, 1, 4, 3],
    [4, 3, 2, 1]
  ];
  const rowBands = shuffle([0, 1], rng);
  const colBands = shuffle([0, 1], rng);
  const rows = rowBands.flatMap((band) => shuffle([band * 2, band * 2 + 1], rng));
  const cols = colBands.flatMap((band) => shuffle([band * 2, band * 2 + 1], rng));
  const symbols = shuffle([1, 2, 3, 4], rng);
  return rows.map((row) => cols.map((col) => symbols[base[row][col] - 1]));
}

function countSolutions(grid, limit = 2) {
  const board = grid.map((row) => row.slice());
  let count = 0;

  function canPlace(row, col, value) {
    for (let i = 0; i < 4; i += 1) {
      if (board[row][i] === value || board[i][col] === value) return false;
    }
    const rowStart = Math.floor(row / 2) * 2;
    const colStart = Math.floor(col / 2) * 2;
    for (let r = rowStart; r < rowStart + 2; r += 1) {
      for (let c = colStart; c < colStart + 2; c += 1) {
        if (board[r][c] === value) return false;
      }
    }
    return true;
  }

  function solve() {
    if (count >= limit) return;
    let best = null;
    let bestOptions = null;
    for (let row = 0; row < 4; row += 1) {
      for (let col = 0; col < 4; col += 1) {
        if (board[row][col]) continue;
        const options = [1, 2, 3, 4].filter((value) => canPlace(row, col, value));
        if (options.length === 0) return;
        if (!bestOptions || options.length < bestOptions.length) {
          best = [row, col];
          bestOptions = options;
        }
      }
    }
    if (!best) {
      count += 1;
      return;
    }
    const [row, col] = best;
    for (const value of bestOptions) {
      board[row][col] = value;
      solve();
      board[row][col] = 0;
    }
  }

  solve();
  return count;
}

function buildPuzzle(solution, hourKey) {
  const rng = makeRng(hmac("puzzle", hourKey));
  const puzzle = solution.map((row) => row.slice());
  const cells = shuffle(
    Array.from({ length: 16 }, (_, index) => [Math.floor(index / 4), index % 4]),
    rng
  );
  const targetClues = 6 + rng(3);

  for (const [row, col] of cells) {
    if (puzzle.flat().filter(Boolean).length <= targetClues) break;
    const previous = puzzle[row][col];
    puzzle[row][col] = 0;
    if (countSolutions(puzzle, 2) !== 1) puzzle[row][col] = previous;
  }

  return puzzle;
}

function makePassword(hourKey, solution) {
  const boardCode = solution.flat().join("");
  const digest = crypto
    .createHmac("sha256", SECRET)
    .update(`password:${hourKey}:${boardCode}`)
    .digest("base64url")
    .slice(0, 10)
    .toUpperCase();
  return `MS-${hourKey.replace(/[-T]/g, "")}-${digest}`;
}

function getCurrentGame() {
  const hourKey = getHourKey();
  const solution = buildSolution(hourKey);
  return {
    hourKey,
    expiresAt: new Date(getExpiry(hourKey)).toISOString(),
    puzzle: buildPuzzle(solution, hourKey),
    solution,
    password: makePassword(hourKey, solution)
  };
}

function isValidGrid(grid) {
  return (
    Array.isArray(grid) &&
    grid.length === 4 &&
    grid.every(
      (row) =>
        Array.isArray(row) &&
        row.length === 4 &&
        row.every((cell) => Number.isInteger(cell) && cell >= 1 && cell <= 4)
    )
  );
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 4096) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (req.method === "OPTIONS") {
    handleOptions(req, res);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/puzzle/current") {
    const game = getCurrentGame();
    sendJson(req, res, 200, {
      puzzle: game.puzzle,
      hourKey: game.hourKey,
      expiresAt: game.expiresAt
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/puzzle/submit") {
    try {
      const body = JSON.parse(await readBody(req));
      if (!isValidGrid(body.grid)) {
        sendJson(req, res, 400, { ok: false, error: "Submit a complete 4x4 grid." });
        return;
      }
      const game = getCurrentGame();
      const correct = JSON.stringify(body.grid) === JSON.stringify(game.solution);
      sendJson(req, res, correct ? 200 : 422, {
        ok: correct,
        message: correct ? "Solved" : "That grid is not the current solution.",
        password: correct ? game.password : undefined,
        expiresAt: game.expiresAt
      });
    } catch (error) {
      sendJson(req, res, 400, { ok: false, error: "Invalid JSON request." });
    }
    return;
  }

  sendJson(req, res, 404, { error: "Not found" });
});

server.listen(PORT, () => {
  const warning = SECRET === "dev-only-change-this-mini-sudoku-secret" ? " with the development secret" : "";
  console.log(`Mini Sudoku backend running at http://localhost:${PORT}${warning}`);
});
