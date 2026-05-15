function allowMethods(req, res, methods) {
  if (!methods.includes(req.method)) {
    res.setHeader("Allow", methods.join(", "));
    sendJson(res, 405, { error: "Method not allowed" });
    return false;
  }
  return true;
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const text = Buffer.concat(chunks).toString("utf8").trim();
  return text ? JSON.parse(text) : {};
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function handleError(res, error) {
  console.error(error);
  const statusCode = error.message === "Market not found" ? 404 : 400;
  sendJson(res, statusCode, { error: error.message || "Request failed" });
}

module.exports = {
  allowMethods,
  handleError,
  readBody,
  sendJson,
};
