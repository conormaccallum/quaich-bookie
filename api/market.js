const { deleteMarket, getState, updateMarket } = require("../lib/store");
const { allowMethods, handleError, readBody, sendJson } = require("../lib/http");

module.exports = async (req, res) => {
  if (!allowMethods(req, res, ["PUT", "DELETE"])) {
    return;
  }

  try {
    if (req.method === "PUT") {
      await updateMarket(req.query.id, await readBody(req));
    } else {
      await deleteMarket(req.query.id);
    }

    sendJson(res, 200, await getState());
  } catch (error) {
    handleError(res, error);
  }
};
