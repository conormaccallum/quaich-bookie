const { getState } = require("../lib/store");
const { allowMethods, handleError, sendJson } = require("../lib/http");

module.exports = async (req, res) => {
  if (!allowMethods(req, res, ["GET"])) {
    return;
  }

  try {
    const state = await getState();
    sendJson(res, 200, state);
  } catch (error) {
    handleError(res, error);
  }
};
