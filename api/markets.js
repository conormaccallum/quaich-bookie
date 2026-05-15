const { createMarket, getState } = require("../lib/store");
const { allowMethods, handleError, readBody, sendJson } = require("../lib/http");

module.exports = async (req, res) => {
  if (!allowMethods(req, res, ["POST"])) {
    return;
  }

  try {
    await createMarket(await readBody(req));
    sendJson(res, 201, await getState());
  } catch (error) {
    handleError(res, error);
  }
};
