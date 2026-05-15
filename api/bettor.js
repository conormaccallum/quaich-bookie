const { deleteBettor, getState } = require("../lib/store");
const { allowMethods, handleError, sendJson } = require("../lib/http");

module.exports = async (req, res) => {
  if (!allowMethods(req, res, ["DELETE"])) {
    return;
  }

  try {
    await deleteBettor(req.query.id);
    sendJson(res, 200, await getState());
  } catch (error) {
    handleError(res, error);
  }
};
