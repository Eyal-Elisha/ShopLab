const router = require("express").Router();
const challengeCtrl = require("../controllers/challengeController");
const { authenticate, maybeAuthenticate } = require("../middleware/auth");

router.get("/", maybeAuthenticate, challengeCtrl.list);
router.post("/solve", authenticate, challengeCtrl.solve);

module.exports = router;
